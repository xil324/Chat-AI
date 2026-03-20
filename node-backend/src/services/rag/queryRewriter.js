import { getMessagesBySessionId } from "../../dao/messageDao.js";

export class QueryRewriter {
	constructor(llmModel) {
		this.llmModel = llmModel;
	}

	/**
	 * Rewrite a follow-up query into a standalone question using session history.
	 *
	 * NOTE: In-memory history is lost on server restart. The DB fallback covers subsequent
	 * turns if messages were persisted, but adds one extra DB read per agentic turn.
	 * A proper session hydration on startup (Phase 8) would eliminate this extra read.
	 */
	async rewrite(currentQuery, inMemoryHistory, sessionId) {
		const recentTurns = await this._getRecentTurns(inMemoryHistory, sessionId);

		// First turn — no context to rewrite with
		if (recentTurns.length === 0) return currentQuery;

		const historyText = recentTurns
			.map((t) => `${t.role}: ${t.content}`)
			.join("\n");
		const prompt = `Given the conversation history below, rewrite the user's latest question as a standalone, self-contained search query. Include all necessary context from the conversation. If the query is already standalone, return it unchanged.
Output ONLY the rewritten query, nothing else.

Conversation history:
${historyText}

Latest question: ${currentQuery}

Rewritten query:`;

		try {
			const rewritten = await this.llmModel.generateResponse(
				[{ role: "user", content: prompt }],
				null,
			);
			return rewritten.trim() || currentQuery;
		} catch {
			return currentQuery;
		}
	}

	async _getRecentTurns(inMemoryHistory, sessionId) {
		// Try in-memory first
		if (inMemoryHistory && inMemoryHistory.length > 0) {
			return inMemoryHistory.slice(-10);
		}

		// DB fallback (one extra read — see NOTE above)
		try {
			const messages = await getMessagesBySessionId(sessionId);
			return messages.slice(-10).map((m) => ({
				role: m.is_user ? "user" : "assistant",
				content: m.content,
			}));
		} catch {
			return [];
		}
	}
}
