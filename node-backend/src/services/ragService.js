import { es, esAvailable, CHUNK_INDEX } from '../utils/ragHelper/esClient.js';
import { embed } from '../utils/ragHelper/embeddingModel.js';

const SEARCH_SIZE = 50;
const RRF_K = 60;
const TOP_K = 10;

/**
 * Retrieve relevant chunks for a query using hybrid BM25 + kNN + RRF.
 * @param {string} query        - User's question
 * @param {string} documentId   - UUID of attached Document
 * @returns {string}            - Concatenated top-K chunks as context string, or '' if ES unavailable
 */
export async function retrieveContext(query, documentId) {
  if (!esAvailable) return '';

  const queryVector = await embed(query);

  // Run BM25 and kNN in parallel — @elastic/elasticsearch v8 API, no body: wrapper
  const [bm25Response, knnResponse] = await Promise.all([
    es.search({
      index: CHUNK_INDEX,
      query: {
        bool: {
          must: [{ match: { chunk_content: query } }],
          filter: [{ term: { document_id: documentId } }],
        },
      },
      size: SEARCH_SIZE,
      _source: ['chunk_content'],
    }),
    es.search({
      index: CHUNK_INDEX,
      knn: {
        field: 'embedding_vector',
        query_vector: queryVector,
        k: SEARCH_SIZE,
        num_candidates: 100,
        filter: { term: { document_id: documentId } },
      },
      size: SEARCH_SIZE,
      _source: ['chunk_content'],
    }),
  ]);

  // RRF fusion
  const fusionScore = {};
  const idToContent = {};

  bm25Response.hits.hits.forEach((hit, idx) => {
    const id = hit._id;
    fusionScore[id] = (fusionScore[id] || 0) + 1 / (idx + RRF_K);
    idToContent[id] = hit._source.chunk_content;
  });

  knnResponse.hits.hits.forEach((hit, idx) => {
    const id = hit._id;
    fusionScore[id] = (fusionScore[id] || 0) + 1 / (idx + RRF_K);
    idToContent[id] = hit._source.chunk_content;
  });

  const topIds = Object.entries(fusionScore)
    .sort((a, b) => b[1] - a[1])
    .slice(0, TOP_K)
    .map(([id]) => id);

  const chunks = topIds.map(id => idToContent[id]).filter(Boolean);
  return chunks.join('\n\n---\n\n');
}