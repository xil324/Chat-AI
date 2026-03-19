import { es, esAvailable, CHUNK_INDEX } from '../utils/ragHelper/esClient.js';
import { embed } from '../utils/ragHelper/embeddingModel.js';
import { detectLanguage } from '../utils/ragHelper/chunker.js';
import { rerank } from '../utils/ragHelper/rerankerClient.js';
import { createAIModel } from '../utils/aihelper/AIModelFactory.js';
import { config } from '../config/index.js';

const SEARCH_SIZE = 20;
const RRF_K      = 60;
const TOP_K      = 5;

// Weighted RRF: semantic weighted higher for healthcare regulatory queries
const WEIGHTS = { fulltext: 0.4, semantic: 0.6 };

// Use whatever model is configured as default for lightweight tasks like translation
const translationModel = createAIModel(config.defaultModelType);

/**
 * Translate a Chinese query to English for cross-lingual BM25 search.
 */
async function translateToEnglish(text) {
  return await translationModel.generateResponse(
    [{ role: 'user', content: `Translate to English. Output ONLY the translation.\n\n${text}` }],
    null,
  );
}

/**
 * Retrieve relevant chunks for a query using hybrid BM25 + kNN + RRF + reranking.
 * @param {string} query      - User's question (any language)
 * @param {string} documentId - UUID of attached Document
 * @returns {string}          - Concatenated top-K reranked chunks as context string
 */
export async function retrieveContext(query, documentId) {
  if (!esAvailable) return '';

  const queryLang = detectLanguage(query);

  // For Chinese queries, translate to English for cross-lingual BM25 coverage
  const searchQuery = queryLang === 'zh'
    ? await translateToEnglish(query)
    : query;

  const queryVector = await embed(query);

  const [bm25Response, knnResponse] = await Promise.all([
    es.search({
      index: CHUNK_INDEX,
      query: {
        bool: {
          must: [{
            multi_match: {
              query: searchQuery,
              fields: ['content', 'content_en', 'content_zh'],
            },
          }],
          filter: [{ term: { doc_id: documentId } }],
        },
      },
      size: SEARCH_SIZE,
      _source: ['content'],
    }),
    es.search({
      index: CHUNK_INDEX,
      knn: {
        field: 'embedding',
        query_vector: queryVector,
        k: SEARCH_SIZE,
        num_candidates: 100,
        filter: { term: { doc_id: documentId } },
      },
      size: SEARCH_SIZE,
      _source: ['content'],
    }),
  ]);

  // Weighted RRF fusion
  const fusionScore = {};
  const idToContent = {};

  bm25Response.hits.hits.forEach((hit, idx) => {
    fusionScore[hit._id] = (fusionScore[hit._id] || 0) + WEIGHTS.fulltext / (idx + RRF_K);
    idToContent[hit._id] = hit._source.content;
  });

  knnResponse.hits.hits.forEach((hit, idx) => {
    fusionScore[hit._id] = (fusionScore[hit._id] || 0) + WEIGHTS.semantic / (idx + RRF_K);
    idToContent[hit._id] = hit._source.content;
  });

  const topIds = Object.entries(fusionScore)
    .sort((a, b) => b[1] - a[1])
    .slice(0, SEARCH_SIZE)
    .map(([id]) => id);

  const candidates = topIds.map(id => idToContent[id]).filter(Boolean);

  // Rerank candidates and return top-K
  const reranked = await rerank(query, candidates, TOP_K);
  return reranked.map(r => r.passage).join('\n\n---\n\n');
}