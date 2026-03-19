import { config } from '../../config/index.js';

const BASE_URL = config.embeddingService.url;

/**
 * Generate a 384-dim embedding vector for a single string.
 * Calls the Python embedding microservice.
 * @param {string} text
 * @returns {Promise<number[]>}
 */
export async function embed(text) {
  const res = await fetch(`${BASE_URL}/embed`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  });
  if (!res.ok) throw new Error(`Embedding service error: ${res.status}`);
  const data = await res.json();
  return data.embedding;
}

/**
 * Generate embeddings for an array of strings in one batch call.
 * @param {string[]} texts
 * @returns {Promise<number[][]>}
 */
export async function embedBatch(texts) {
  if (texts.length === 0) return [];
  const res = await fetch(`${BASE_URL}/embed/batch`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ texts }),
  });
  if (!res.ok) throw new Error(`Embedding service error: ${res.status}`);
  const data = await res.json();
  return data.embeddings;
}