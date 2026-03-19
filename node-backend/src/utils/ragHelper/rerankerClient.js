import { config } from '../../config/index.js';

const BASE_URL = config.rerankerService.url;

/**
 * Rerank a list of passages against a query using the cross-encoder service.
 * @param {string}   query
 * @param {string[]} passages
 * @param {number}   topK     number of results to return (default 5)
 * @returns {Promise<{ index: number, passage: string, score: number }[]>}
 */
export async function rerank(query, passages, topK = 5) {
  if (!passages.length) return [];
  const res = await fetch(`${BASE_URL}/rerank`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, passages, top_k: topK }),
  });
  if (!res.ok) throw new Error(`Reranker service error: ${res.status}`);
  const data = await res.json();
  return data.results;
}