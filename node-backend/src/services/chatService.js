import { v4 as uuidv4 } from "uuid";
import { aiHelperManager } from "../utils/aihelper/AIHelperManager.js";
import { createAIModel } from "../utils/aihelper/AIModelFactory.js";
import {
	createSession,
	getSessionsByUserName,
	getSessionById,
} from "../dao/sessionDao.js";
import { createMessage, getMessagesBySessionId } from "../dao/messageDao.js";
import { getDocumentById } from "../dao/documentDao.js";
import { retrieveChunks } from "./ragService.js";
import { QueryRewriter } from "./rag/queryRewriter.js";
import { AgenticRAGPipeline } from "./rag/agenticPipeline.js";

async function enrichWithDocumentName(sessions) {
	return Promise.all(
		sessions.map(async (s) => {
			if (!s.attachedDocumentId) return s;
			const doc = await getDocumentById(s.attachedDocumentId).catch(() => null);
			return { ...s, attachedDocumentName: doc?.filename || "" };
		}),
	);
}

export async function getSessions(userName) {
	const sessionIds = aiHelperManager.getSessions(userName);

	let result;
	if (sessionIds.length === 0) {
		const dbSessions = await getSessionsByUserName(userName);
		result = dbSessions.map((s) => ({
			sessionId: s.id,
			name: s.title,
			attachedDocumentId: s.attached_document_id || null,
		}));
	} else {
		const dbSessions = await Promise.all(
			sessionIds.map((id) => getSessionById(id).catch(() => null)),
		);
		result = sessionIds.map((id, i) => {
			const s = dbSessions[i];
			return {
				sessionId: id,
				name: s?.title || id,
				attachedDocumentId: s?.attached_document_id || null,
			};
		});
	}

	return enrichWithDocumentName(result);
}

export async function createEmptySession(userName) {
	const sessionId = uuidv4();

	await createSession({
		id: sessionId,
		user_name: userName,
		title: "New chat",
		created_at: new Date(),
		updated_at: new Date(),
	});

	return {
		sessionId,
		name: "New chat",
		attachedDocumentId: null,
	};
}

export async function sendNewSession(userName, question, modelType) {
	const sessionId = uuidv4();

	await createSession({
		id: sessionId,
		user_name: userName,
		title: question.slice(0, 100),
		created_at: new Date(),
		updated_at: new Date(),
	});

	const helper = aiHelperManager.getOrCreate(userName, sessionId, modelType);
	const reply = await helper.generateResponse(question);

	await saveMessages(sessionId, userName, question, reply);
	return { sessionId, message: reply };
}

export async function sendMessage(userName, sessionId, question, modelType) {
	const helper = aiHelperManager.getOrCreate(userName, sessionId, modelType);

	let session;
	try {
		session = await getSessionById(sessionId);
	} catch (err) {
		console.warn("Failed to load session:", err.message);
	}

	if (session?.attached_document_id) {
		const llmModel = createAIModel(modelType);
		const rewriter = new QueryRewriter(llmModel);
		const pipeline = new AgenticRAGPipeline(llmModel);

		const rewrittenQuery = await rewriter.rewrite(
			question,
			helper.history,
			sessionId,
		);
		const result = await pipeline.query(
			question,
			rewrittenQuery,
			session.attached_document_id,
			retrieveChunks,
		);

		// Sync in-memory history manually
		helper.loadMessage("user", question);
		helper.loadMessage("assistant", result.answer);

		await saveMessages(
			sessionId,
			userName,
			question,
			result.answer,
			result.citations,
			result.rounds,
		);
		return {
			message: result.answer,
			citations: result.citations,
			rounds: result.rounds,
		};
	}

	// ── Non-agentic path (no document attached) ──────────────────────────────
	const reply = await helper.generateResponse(question);
	await saveMessages(sessionId, userName, question, reply);
	return { message: reply };
}

export async function getHistory(sessionId) {
	const messages = await getMessagesBySessionId(sessionId);
	return messages.map((m) => ({
		is_user: m.is_user,
		content: m.content,
		citations: m.citations || [],
	}));
}

async function saveMessages(
	sessionId,
	userName,
	userContent,
	aiContent,
	citations = [],
	rounds = null,
) {
	const now = new Date();
	await createMessage({
		session_id: sessionId,
		user_name: userName,
		content: userContent,
		is_user: true,
		created_at: now,
	});
	await createMessage({
		session_id: sessionId,
		user_name: userName,
		content: aiContent,
		is_user: false,
		created_at: new Date(),
		citations,
		rounds,
	});
}
