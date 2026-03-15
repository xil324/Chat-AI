import { v4 as uuidv4 } from "uuid";
import { aiHelperManager } from "../utils/aihelper/AIHelperManager.js";
import {
	createSession,
	getSessionsByUserName,
	getSessionById,
} from "../dao/sessionDao.js";
import { createMessage, getMessagesBySessionId } from "../dao/messageDao.js";
import { getDocumentById } from "../dao/documentDao.js";
import { retrieveContext } from "./ragService.js";

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
	const dbSessions = await getSessionsByUserName(userName);
	const sessionMap = new Map(dbSessions.map((s) => [s.id, s]));

	let result;
	if (sessionIds.length === 0) {
		result = dbSessions.map((s) => ({
			sessionId: s.id,
			name: s.title,
			attachedDocumentId: s.attached_document_id || null,
		}));
	} else {
		result = sessionIds.map((id) => {
			const s = sessionMap.get(id);
			return {
				sessionId: id,
				name: s?.title || id,
				attachedDocumentId: s?.attached_document_id || null,
			};
		});
	}

	return enrichWithDocumentName(result);
}

export async function sendNewSession(userName, question, modelType) {
	const sessionId = uuidv4();

	// Persist session with question as title
	await createSession({
		id: sessionId,
		user_name: userName,
		title: question.slice(0, 100),
		created_at: new Date(),
		updated_at: new Date(),
	});

	// Get or create helper and generate response
	const helper = aiHelperManager.getOrCreate(userName, sessionId, modelType);
	const reply = await helper.generateResponse(question);

	// Persist both messages
	await saveMessages(sessionId, userName, question, reply);

	return { sessionId, message: reply };
}

export async function sendMessage(userName, sessionId, question, modelType) {
	const helper = aiHelperManager.getOrCreate(userName, sessionId, modelType);
	let context = null;
	try {
		const session = await getSessionById(sessionId);
		if (session?.attached_document_id) {
			context = await retrieveContext(question, session.attached_document_id);
		}
	} catch (err) {
		console.warn(
			"RAG retrieval failed, continuing without context:",
			err.message,
		);
	}

	const reply = await helper.generateResponse(question, context);
	await saveMessages(sessionId, userName, question, reply);
	return { message: reply };
}

export async function getHistory(sessionId) {
	const messages = await getMessagesBySessionId(sessionId);
	return messages.map((m) => ({ is_user: m.is_user, content: m.content }));
}

async function saveMessages(sessionId, userName, userContent, aiContent) {
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
	});
}
