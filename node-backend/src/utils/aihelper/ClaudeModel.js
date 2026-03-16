import Anthropic from '@anthropic-ai/sdk';
import { config } from '../../config/index.js';

export class ClaudeModel {
  constructor() {
    this.client = new Anthropic({ apiKey: config.claude.apiKey });
    this.model = config.claude.model;
  }

  async generateResponse(history, systemPrompt = null) {
    // history: [{ role: 'user'|'assistant', content: string }]
    const params = {
      model: this.model,
      max_tokens: 8096,
      messages: history,
    };
    if (systemPrompt) {
      params.system = systemPrompt;
    }
    const response = await this.client.messages.create(params);
    return response.content[0].text;
  }
}
