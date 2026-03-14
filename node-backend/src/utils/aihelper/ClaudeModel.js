import Anthropic from '@anthropic-ai/sdk';
import { config } from '../../config/index.js';

export class ClaudeModel {
  constructor() {
    this.client = new Anthropic({ apiKey: config.claude.apiKey });
    this.model = config.claude.model;
  }

  async generateResponse(history) {
    // history: [{ role: 'user'|'assistant', content: string }]
    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: 8096,
      messages: history,
    });
    return response.content[0].text;
  }
}
