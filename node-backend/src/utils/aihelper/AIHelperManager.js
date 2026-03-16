import { createAIModel } from "./AIModelFactory.js";
import { AIHelper } from "./AIHelper.js";

/**
 * Singleton that holds all in-memory AIHelper instances.
 * Map structure: userName -> sessionId -> AIHelper
 */
class AIHelperManager {
	constructor() {
		this.aiHelpers = new Map(); // Map<userName, Map<sessionId, AIHelper>>
	}

	getOrCreate(userName, sessionId, modelType) {
		if (!this.aiHelpers.has(userName)) {
			this.aiHelpers.set(userName, new Map());
		}
		const userHelpers = this.aiHelpers.get(userName);

		const existing = userHelpers.get(sessionId);
		if (existing && existing.modelType === modelType) {
			return existing;
		}
		const model = createAIModel(modelType);
		const helper = new AIHelper(model, sessionId, modelType);
		if (existing) {
			helper.history = existing.history; // preserve conversation history
		}
		userHelpers.set(sessionId, helper);
		return helper;
	}

	get(userName, sessionId) {
		return this.aiHelpers.get(userName)?.get(sessionId) || null;
	}

	getSessions(userName) {
		const userHelpers = this.aiHelpers.get(userName);
		if (!userHelpers) return [];
		return Array.from(userHelpers.keys());
	}

	// Called on startup to load history from DB without making AI calls
	loadMessage(userName, sessionId, modelType, role, content) {
		const helper = this.getOrCreate(userName, sessionId, modelType);
		helper.loadMessage(role, content);
		return helper;
	}
}

export const aiHelperManager = new AIHelperManager();
