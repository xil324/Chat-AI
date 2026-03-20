/**
 * AIHelper manages conversation history for a single session.
 * history entries: { role: 'user'|'assistant', content: string }
 */
export class AIHelper {
	constructor(model, sessionId, modelType) {
		this.model = model;
		this.sessionId = sessionId;
		this.modelType = modelType;
		this.history = [];
	}

	addMessage(role, content) {
		this.history.push({ role, content });
	}

	// Load historical messages from DB on startup (no AI call)
	loadMessage(role, content) {
		this.history.push({ role, content });
	}

	async generateResponse(userMessage, systemContext = null) {
		const userMsg = { role: "user", content: userMessage };
		const messagesToSend = [...this.history, userMsg];

		const systemPrompt = systemContext
			? `You are a multilingual healthcare regulatory assistant for U.S. healthcare policy.\nThe following excerpts are retrieved from the user's uploaded documents. Use them as your primary reference when answering, and supplement with your own knowledge where helpful.\nAlways answer in the SAME LANGUAGE as the user's question. Use plain, accessible language.\n\n[Document Excerpts]\n${systemContext}`
			: `You are a multilingual healthcare regulatory assistant for U.S. healthcare policy. Answer in the same language as the user's question. Use plain, accessible language.`;

		const reply = await this.model.generateResponse(
			messagesToSend,
			systemPrompt,
		);
		this.history.push(userMsg);
		this.history.push({ role: "assistant", content: reply });
		return reply;
	}
}
