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
 * Retrieve relevant chunks with metadata for citation.
 * Returns structured objects: { chunkId, content, title, source, url }
 *
 * Key implementation notes:
 * - _source includes title, source, chunk_index (top-level ES fields, not nested)
 * - idToMeta runs in parallel with idToContent to survive the reranker's text-only interface
 * - filteredIds keeps candidates and candidateMeta in sync (never filter independently)
 * - r.index from reranker is a position in filteredIds/candidates, NOT in topIds
 */
export async function retrieveChunks(query, documentId) {
  if (!esAvailable) return [];

  const queryLang = detectLanguage(query);
  const searchQuery = queryLang === 'zh'
    ? await translateToEnglish(query)
    : query;

  const queryVector = await embed(query);

  const [bm25Response, knnResponse] = await Promise.all([
    es.search({
      index: CHUNK_INDEX,
      query: {
        bool: {
          must: [{ multi_match: { query: searchQuery, fields: ['content', 'content_en', 'content_zh'] } }],
          filter: [{ term: { doc_id: documentId } }],
        },
      },
      size: SEARCH_SIZE,
      _source: ['content', 'title', 'source', 'chunk_index'],
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
      _source: ['content', 'title', 'source', 'chunk_index'],
    }),
  ]);

  const fusionScore = {};
  const idToContent = {};
  const idToMeta    = {};

  bm25Response.hits.hits.forEach((hit, idx) => {
    fusionScore[hit._id] = (fusionScore[hit._id] || 0) + WEIGHTS.fulltext / (idx + RRF_K);
    idToContent[hit._id] = hit._source.content;
    idToMeta[hit._id]    = {
      title:      hit._source.title       || '',
      source:     hit._source.source      || '',
      url:        null, // ES index has no url field yet
      chunkIndex: hit._source.chunk_index,
    };
  });

  knnResponse.hits.hits.forEach((hit, idx) => {
    fusionScore[hit._id] = (fusionScore[hit._id] || 0) + WEIGHTS.semantic / (idx + RRF_K);
    idToContent[hit._id] = hit._source.content;
    // Preserve existing meta if already seen via BM25
    idToMeta[hit._id] = idToMeta[hit._id] || {
      title:      hit._source.title       || '',
      source:     hit._source.source      || '',
      url:        null,
      chunkIndex: hit._source.chunk_index,
    };
  });

  const topIds = Object.entries(fusionScore)
    .sort((a, b) => b[1] - a[1])
    .slice(0, SEARCH_SIZE)
    .map(([id]) => id);

  // Filter on idToContent only — keeps candidates and candidateMeta in sync.
  // Never apply independent .filter(Boolean) on each; that would desync them.
  const filteredIds   = topIds.filter(id => idToContent[id]);
  const candidates    = filteredIds.map(id => idToContent[id]);
  const candidateMeta = filteredIds.map(id => idToMeta[id]);

  const reranked = await rerank(query, candidates, TOP_K);

  // r.index is a position in filteredIds/candidates, NOT in topIds
  return reranked.map(r => ({
    chunkId:    filteredIds[r.index],
    content:    r.passage,
    chunkIndex: candidateMeta[r.index]?.chunkIndex ?? null,
    title:      candidateMeta[r.index]?.title  || '',
    source:     candidateMeta[r.index]?.source || '',
    url:        candidateMeta[r.index]?.url    || null,
  }));
}

/**
 * Retrieve context string for non-agentic use (unchanged interface).
 */
export async function retrieveContext(query, documentId) {
  if (!esAvailable) return '';
  const chunks = await retrieveChunks(query, documentId);
  return chunks.map(c => c.content).join('\n\n---\n\n');
}

/**
 * BM25-only retrieval — no embedding, no fusion, no reranker.
 * Safe to run without the embedding service (port 8001).
 */
export async function retrieveChunksBM25Only(query, documentId) {
  if (!esAvailable) return [];

  const queryLang = detectLanguage(query);
  const searchQuery = queryLang === 'zh'
    ? await translateToEnglish(query)
    : query;

  const response = await es.search({
    index: CHUNK_INDEX,
    query: {
      bool: {
        must: [{ multi_match: { query: searchQuery, fields: ['content', 'content_en', 'content_zh'] } }],
        filter: [{ term: { doc_id: documentId } }],
      },
    },
    size: TOP_K,
    _source: ['content', 'title', 'source', 'chunk_index'],
  });

  return response.hits.hits.map(hit => ({
    chunkId:    hit._id,
    content:    hit._source.content,
    chunkIndex: hit._source.chunk_index,
    title:      hit._source.title  || '',
    source:     hit._source.source || '',
    url:        null,
  }));
}

/**
 * kNN-only retrieval — no translation, no BM25, no reranker.
 * Uses the original query (not translated) for semantic search.
 */
export async function retrieveChunksKNNOnly(query, documentId) {
  if (!esAvailable) return [];

  const queryVector = await embed(query);

  const response = await es.search({
    index: CHUNK_INDEX,
    knn: {
      field: 'embedding',
      query_vector: queryVector,
      k: TOP_K,
      num_candidates: 100,
      filter: { term: { doc_id: documentId } },
    },
    size: TOP_K,
    _source: ['content', 'title', 'source', 'chunk_index'],
  });

  return response.hits.hits.map(hit => ({
    chunkId:    hit._id,
    content:    hit._source.content,
    chunkIndex: hit._source.chunk_index,
    title:      hit._source.title  || '',
    source:     hit._source.source || '',
    url:        null,
  }));
}

/**
 * Hybrid retrieval (BM25 + kNN weighted RRF) without the reranker.
 * Uses the exact same RRF formula as retrieveChunks so the eval
 * comparison isolates the reranker's contribution.
 */
export async function retrieveChunksHybridOnly(query, documentId) {
  if (!esAvailable) return [];

  const queryLang = detectLanguage(query);
  const searchQuery = queryLang === 'zh'
    ? await translateToEnglish(query)
    : query;

  const queryVector = await embed(query);

  const [bm25Response, knnResponse] = await Promise.all([
    es.search({
      index: CHUNK_INDEX,
      query: {
        bool: {
          must: [{ multi_match: { query: searchQuery, fields: ['content', 'content_en', 'content_zh'] } }],
          filter: [{ term: { doc_id: documentId } }],
        },
      },
      size: SEARCH_SIZE,
      _source: ['content', 'title', 'source', 'chunk_index'],
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
      _source: ['content', 'title', 'source', 'chunk_index'],
    }),
  ]);

  const fusionScore = {};
  const idToContent = {};
  const idToMeta    = {};

  bm25Response.hits.hits.forEach((hit, idx) => {
    fusionScore[hit._id] = (fusionScore[hit._id] || 0) + WEIGHTS.fulltext / (idx + RRF_K);
    idToContent[hit._id] = hit._source.content;
    idToMeta[hit._id] = {
      chunkIndex: hit._source.chunk_index,
      title:      hit._source.title  || '',
      source:     hit._source.source || '',
    };
  });

  knnResponse.hits.hits.forEach((hit, idx) => {
    fusionScore[hit._id] = (fusionScore[hit._id] || 0) + WEIGHTS.semantic / (idx + RRF_K);
    idToContent[hit._id] = hit._source.content;
    idToMeta[hit._id] = idToMeta[hit._id] || {
      chunkIndex: hit._source.chunk_index,
      title:      hit._source.title  || '',
      source:     hit._source.source || '',
    };
  });

  const topIds = Object.entries(fusionScore)
    .sort((a, b) => b[1] - a[1])
    .slice(0, TOP_K)
    .map(([id]) => id)
    .filter(id => idToContent[id]);

  return topIds.map(id => ({
    chunkId:    id,
    content:    idToContent[id],
    chunkIndex: idToMeta[id]?.chunkIndex ?? null,
    title:      idToMeta[id]?.title  || '',
    source:     idToMeta[id]?.source || '',
    url:        null,
  }));
}