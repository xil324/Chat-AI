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
    const userMsg = { role: 'user', content: userMessage };

    // Build messages for LLM call (history not mutated until after await)
    let messagesToSend = [...this.history, userMsg];
    if (systemContext) {
      // Replace user message with context-enriched version for LLM only
      messagesToSend = [
        ...this.history,
        {
          role: 'user',
          content: `[Relevant document context]\n${systemContext}\n\n[User question]\n${userMessage}`,
        },
      ];
    }

    // Only persist to history after the model call succeeds
    const reply = await this.model.generateResponse(messagesToSend);
    this.history.push(userMsg);
    this.history.push({ role: 'assistant', content: reply });
    return reply;
  }
}
