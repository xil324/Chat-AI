import { pipeline } from "@xenova/transformers";

let embedder = null;

/**
 * Lazy-load the sentence embedding model.
 * First call downloads the model (~23MB); subsequent calls use cache.
 */
async function getEmbedder() {
	if (!embedder) {
		embedder = await pipeline("feature-extraction", "Xenova/all-MiniLM-L6-v2");
	}
	return embedder;
}

/**
 * Generate a 384-dim embedding vector for a single string.
 * @param {string} text
 * @returns {number[]}
 */
export async function embed(text) {
	const model = await getEmbedder();
	const output = await model(text, { pooling: "mean", normalize: true });
	return Array.from(output.data);
}

/**
 * Generate embeddings for an array of strings (serial to avoid memory issues).
 * @param {string[]} texts
 * @returns {number[][]}
 */
export async function embedBatch(texts) {
	const model = await getEmbedder();
	const results = [];
	for (const text of texts) {
		const output = await model(text, { pooling: "mean", normalize: true });
		results.push(Array.from(output.data));
	}
	return results;
}
