import { ClaudeModel } from './ClaudeModel.js';
import { OllamaModel } from './OllamaModel.js';

const creators = {
  '2': () => new OllamaModel(),
  '3': () => new ClaudeModel(),
};

export function createAIModel(modelType) {
  const creator = creators[modelType];
  if (!creator) throw new Error(`Unsupported model type: ${modelType}`);
  return creator();
}

// Register a new provider at runtime if needed
export function registerModel(modelType, creator) {
  creators[modelType] = creator;
}
