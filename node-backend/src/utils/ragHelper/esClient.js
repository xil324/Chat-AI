import { Client } from '@elastic/elasticsearch';
import { config } from '../../config/index.js';

export const es = new Client({ node: config.elasticsearch.url, requestTimeout: 60000 });

const EMBEDDING_DIMS = 384;
export const CHUNK_INDEX = 'chat_ai_chunk_info';

// Set to true after successful initElasticsearch() — checked by RAG services before using es
export let esAvailable = false;

export async function initElasticsearch() {
  const isAlive = await es.ping().catch(() => false);
  if (!isAlive) {
    console.warn('Elasticsearch not available — RAG disabled');
    return false;
  }

  const chunkIndexExists = await es.indices.exists({ index: CHUNK_INDEX });
  if (!chunkIndexExists) {
    await es.indices.create({
      index: CHUNK_INDEX,
      settings: { number_of_replicas: 0 },
      mappings: {
        properties: {
          document_id: { type: 'keyword' },
          user_name:   { type: 'keyword' },
          chunk_index: { type: 'integer' },
          chunk_content: {
            type: 'text',
            analyzer: 'standard',
            search_analyzer: 'standard',
          },
          embedding_vector: {
            type: 'dense_vector',
            element_type: 'float',
            dims: EMBEDDING_DIMS,
            index: true,
            index_options: { type: 'int8_hnsw' },
          },
        },
      },
    });
    console.log(`Created Elasticsearch index: ${CHUNK_INDEX}`);
  }

  esAvailable = true;
  console.log('Elasticsearch connected — RAG enabled');
  return true;
}
