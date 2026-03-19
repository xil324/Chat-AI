import { Client } from "@elastic/elasticsearch";
import { config } from "../../config/index.js";

export const es = new Client({
	node: config.elasticsearch.url,
	requestTimeout: 60000,
});

const EMBEDDING_DIMS = 384;
export const CHUNK_INDEX = "healthcare_chunks";

export let esAvailable = false;

export async function initElasticsearch() {
	const isAlive = await es.ping().catch(() => false);
	if (!isAlive) {
		console.warn("Elasticsearch not available — RAG disabled");
		return false;
	}

	const exists = await es.indices.exists({ index: CHUNK_INDEX });
	if (!exists) {
		await es.indices.create({
			index: CHUNK_INDEX,
			settings: {
				number_of_replicas: 0,
			},
			mappings: {
				properties: {
					// chunk content fields
					// note: 'standard' analyzer is used as fallback for Chinese until
					content: { type: "text", analyzer: "standard" },
					content_en: { type: "text", analyzer: "english" },
					content_zh: { type: "text", analyzer: "standard" },
					embedding: {
						type: "dense_vector",
						dims: EMBEDDING_DIMS,
						index: true,
						similarity: "cosine",
					},
					// document metadata
					doc_id: { type: "keyword" },
					user_name: { type: "keyword" },
					title: { type: "text" },
					source: { type: "keyword" },
					category: { type: "keyword" },
					language: { type: "keyword" },
					chunk_index: { type: "integer" },
				},
			},
		});
		console.log(`Created Elasticsearch index: ${CHUNK_INDEX}`);
	}

	esAvailable = true;
	console.log("Elasticsearch connected — RAG enabled");
	return true;
}
