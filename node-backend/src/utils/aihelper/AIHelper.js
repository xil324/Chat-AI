/**
 * AIHelper manages conversation history for a single session.
 * history entries: { role: 'user'|'assistant', content: string }
 */
export class AIHelper {
  constructor(model, sessionId) {
    this.model = model;
    this.sessionId = sessionId;
    this.history = [];
  }

  addMessage(role, content) {
    this.history.push({ role, content });
  }

  // Load historical messages from DB on startup (no AI call)
  loadMessage(role, content) {
    this.history.push({ role, content });
  }

  async generateResponse(userMessage) {
    this.history.push({ role: 'user', content: userMessage });
    const reply = await this.model.generateResponse(this.history);
    this.history.push({ role: 'assistant', content: reply });
    return reply;
  }
}
