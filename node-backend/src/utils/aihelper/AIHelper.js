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
			? `You are a helpful assistant. The user has uploaded a document. Use the following relevant excerpts to answer their question. If the answer is not found in the excerpts, say so.\n\n[Document context]\n${systemContext}`
			: null;

		console.log("systemPrompt", systemPrompt);
		// Only persist to history after the model call succeeds
		const reply = await this.model.generateResponse(
			messagesToSend,
			systemPrompt,
		);
		this.history.push(userMsg);
		this.history.push({ role: "assistant", content: reply });
		return reply;
	}
}
