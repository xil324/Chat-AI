const MAX_ROUNDS = 3;
const MAX_CHUNKS = 15;

export class AgenticRAGPipeline {
	constructor(llmModel) {
		this.llmModel = llmModel;
	}

	/**
	 * Run the ReAct retrieval loop.
	 * @param {string}   userQuery        - Original user question (used in LLM evaluation prompt)
	 * @param {string}   rewrittenQuery   - Standalone query after rewriting (used for first retrieval)
	 * @param {string}   docId            - ES document filter
	 * @param {Function} retrieveChunksFn - async (query, docId) => chunk[]
	 * @returns {{ answer, citations, rounds, chunksUsed, partial }}
	 */
	async query(userQuery, rewrittenQuery, docId, retrieveChunksFn) {
		let allChunks = [];
		let currentQuery = rewrittenQuery;

		for (let round = 0; round < MAX_ROUNDS; round++) {
			const newChunks = await retrieveChunksFn(currentQuery, docId);
			allChunks = this._deduplicateChunks([...allChunks, ...newChunks]).slice(
				0,
				MAX_CHUNKS,
			);

			// Short-circuit: no documents found at all on first round
			if (round === 0 && allChunks.length === 0) {
				return {
					answer: "No relevant documents found for your question.",
					citations: [],
					rounds: 1,
					chunksUsed: 0,
					partial: true,
				};
			}

			let evaluation;
			try {
				const raw = await this.llmModel.generateResponse(
					[
						{
							role: "user",
							content: this._buildEvaluationPrompt(userQuery, allChunks),
						},
					],
					null,
				);
				evaluation = parseEvaluation(raw);
			} catch (err) {
				console.error("RAG evaluation step failed:", err);
				continue;
			}

			if (evaluation.sufficient) {
				return {
					answer: evaluation.answer,
					citations: this._mapCitations(evaluation.citations || [], allChunks),
					rounds: round + 1,
					chunksUsed: allChunks.length,
					partial: false,
				};
			}

			currentQuery = evaluation.refined_query || currentQuery;
		}

		return this._generateBestEffort(userQuery, allChunks);
	}

	/**
	 * Remove duplicate chunks by chunkId, preserving first-seen order.
	 * @param {Array} chunks - Combined chunk array (may contain duplicates)
	 * @returns {Array} Deduplicated chunks
	 */
	_deduplicateChunks(chunks) {
		const seen = new Set();
		return chunks.filter((c) => {
			if (seen.has(c.chunkId)) return false;
			seen.add(c.chunkId);
			return true;
		});
	}

	/**
	 * Build the LLM prompt that asks the model to evaluate whether the retrieved
	 * chunks are sufficient to answer the question, or to suggest a refined query.
	 * @param {string} userQuery - Original user question
	 * @param {Array}  chunks    - Currently accumulated chunks (deduplicated)
	 * @returns {string} Prompt string
	 */
	_buildEvaluationPrompt(userQuery, chunks) {
		const context = chunks
			.map(
				(c, i) =>
					`[${i + 1}] (Source: ${c.title || "Unknown"} - ${c.source || "Unknown"})\n${c.content}`,
			)
			.join("\n\n");

		return `Context from knowledge base:\n${context}\n\nUser question: ${userQuery}\n\nInstructions:\n1. Evaluate whether the provided context contains enough information to answer.\n2. Answer in the same language as the user's question.\n3. Only use information from the provided context.\n4. Cite sources using [1], [2], etc. for every claim.\n5. If information is insufficient, provide a refined search query.\n\nReturn ONLY a valid JSON object. Do not add markdown, explanation, headings, or any text before or after the JSON.\n{\n  "sufficient": true | false,\n  "answer": "Your cited answer (only if sufficient)",\n  "citations": [\n    { "index": 1, "title": "...", "source": "..." }\n  ],\n  "refined_query": "Better search query (only if not sufficient)",\n  "missing_info": "What information is missing (only if not sufficient)"\n}`;
	}

	/**
	 * Resolve citation indices returned by the LLM to full chunk metadata.
	 * Index 1 in the LLM response corresponds to allChunks[0].
	 * @param {Array<{index: number}>} citationIndices - Citations from LLM evaluation
	 * @param {Array} allChunks       - Accumulated chunks in prompt order
	 * @returns {Array<{index, title, source, url}>}
	 */
	_mapCitations(citationIndices, allChunks) {
		return citationIndices.map((c) => ({
			index: c.index,
			title: allChunks[c.index - 1]?.title || "Unknown",
			source: allChunks[c.index - 1]?.source || "Unknown",
			url: allChunks[c.index - 1]?.url || null,
		}));
	}

	/**
	 * Fallback after MAX_ROUNDS: ask the LLM to answer with whatever chunks were
	 * collected, flagging the response as partial.
	 * @param {string} userQuery  - Original user question
	 * @param {Array}  allChunks  - All accumulated chunks across rounds
	 * @returns {{ answer, citations, rounds, chunksUsed, partial }}
	 */
	async _generateBestEffort(userQuery, allChunks) {
		const context = allChunks
			.map(
				(c, i) =>
					`[${i + 1}] (Source: ${c.title || "Unknown"} - ${c.source || "Unknown"})\n${c.content}`,
			)
			.join("\n\n");

		const prompt = `Context from knowledge base:\n${context}\n\nUser question: ${userQuery}\n\nInstructions:\n1. Answer with available information. If incomplete, clearly state what could not be found.\n2. Answer in the same language as the user's question.\n3. Cite sources using [1], [2], etc. for every claim you can support.\n\nReturn ONLY a valid JSON object. Do not add markdown, explanation, headings, or any text before or after the JSON.\n{\n  "sufficient": true,\n  "answer": "...",\n  "citations": [{ "index": 1, "title": "...", "source": "..." }]\n}`;

		try {
			const raw = await this.llmModel.generateResponse(
				[{ role: "user", content: prompt }],
				null,
			);
			const ev = parseEvaluation(raw);
			return {
				answer: ev.answer,
				citations: this._mapCitations(ev.citations || [], allChunks),
				rounds: MAX_ROUNDS,
				chunksUsed: allChunks.length,
				partial: true,
			};
		} catch (err) {
			console.error("RAG best-effort generation failed:", err);
			return {
				answer: "Unable to generate a response with the available documents.",
				citations: [],
				rounds: MAX_ROUNDS,
				chunksUsed: allChunks.length,
				partial: true,
			};
		}
	}
}

/**
 * Parse the LLM's JSON evaluation response, stripping markdown code fences if present.
 * Falls back to a best-effort object using the raw string as the answer if JSON parsing fails.
 * @param {string} llmOutputString - Raw LLM output
 * @returns {{ sufficient: boolean, answer: string, citations: Array, refined_query: string|null }}
 */
export function parseEvaluation(llmOutputString) {
	const cleaned = String(llmOutputString || "")
		.replace(/```json\n?/g, "")
		.replace(/```\n?/g, "")
		.trim();

	try {
		return JSON.parse(cleaned);
	} catch {
		const firstBrace = cleaned.indexOf("{");
		const lastBrace = cleaned.lastIndexOf("}");

		if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
			const candidate = cleaned.slice(firstBrace, lastBrace + 1);
			try {
				return JSON.parse(candidate);
			} catch {
				console.warn("LLM returned non-parseable JSON payload");
			}
		} else {
			console.warn("LLM returned non-JSON response");
		}

		return {
			sufficient: true,
			answer: cleaned,
			citations: [],
			refined_query: null,
		};
	}
}
