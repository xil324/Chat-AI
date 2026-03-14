import { config } from '../../config/index.js';

export class OllamaModel {
  constructor() {
    this.baseURL = config.ollama.baseURL;
    this.modelName = config.ollama.modelName;
  }

  async generateResponse(history) {
    // history: [{ role: 'user'|'assistant', content: string }]
    const response = await fetch(`${this.baseURL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: this.modelName,
        messages: history,
        stream: false,
      }),
    });

    if (!response.ok) {
      throw new Error(`Ollama request failed: ${response.status}`);
    }

    const data = await response.json();
    return data.message?.content || '';
  }
}
