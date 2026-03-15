import { v4 as uuidv4 } from "uuid";
import { unlink, rename } from "fs/promises";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { extractTextFromPDF } from "../utils/ragHelper/pdfParser.js";
import { splitTextWithOverlap } from "../utils/ragHelper/chunker.js";
import { embedBatch } from "../utils/ragHelper/embeddingModel.js";
import { es, CHUNK_INDEX } from "../utils/ragHelper/esClient.js";
import {
	createDocument,
	getDocumentsByUserName,
	getDocumentById,
	deleteDocument as deleteDocumentFromDB,
} from "../dao/documentDao.js";
import {
	getSessionById,
	updateAttachedDocument,
	clearAttachedDocument,
} from "../dao/sessionDao.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
// __dirname = node-backend/src/services/ → ../../ = node-backend/ → ../../uploads = node-backend/uploads/
const UPLOADS_DIR = join(__dirname, "../../uploads");

export async function uploadDocument(userName, file) {
	const docId = uuidv4();
	const filename = file.originalname;
	// Sanitise filename to prevent path traversal; disk file keyed by docId only
	const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 200);
	const filePath = join(UPLOADS_DIR, `${docId}_${safeName}`);

	// multer writes to temp location; move to permanent path
	await rename(file.path, filePath);

	const fullText = await extractTextFromPDF(filePath);
	const chunks = splitTextWithOverlap(fullText);
	const vectors = await embedBatch(chunks);

	console.log("start to handling chuncks");
	const operations = chunks.flatMap((chunk, idx) => [
		{ index: { _index: CHUNK_INDEX } },
		{
			document_id: docId,
			user_name: userName,
			chunk_index: idx,
			chunk_content: chunk,
			embedding_vector: vectors[idx],
		},
	]);

	console.log("operations", operations.length);

	if (operations.length > 0) {
		// @elastic/elasticsearch v8 API: use operations: not body:
		console.log("start to writing to es database");
		await es.bulk({ operations, refresh: false });
		console.log("finish inserting all the data");
	}

	await createDocument({
		id: docId,
		user_name: userName,
		filename,
		file_path: filePath,
		created_at: new Date(),
	});

	return { id: docId, filename };
}

export async function listDocuments(userName) {
	const docs = await getDocumentsByUserName(userName);
	return docs?.map((d) => ({
		id: d.id,
		filename: d.filename,
		created_at: d.created_at,
	}));
}

export async function deleteDocumentById(userName, documentId) {
	const doc = await getDocumentById(documentId);
	if (!doc)
		throw Object.assign(new Error("Document not found"), { status: 404 });
	if (doc.user_name !== userName)
		throw Object.assign(new Error("Forbidden"), { status: 403 });

	// Delete from ES
	await es.deleteByQuery({
		index: CHUNK_INDEX,
		query: { term: { document_id: documentId } },
		refresh: true,
	});

	// Delete file from disk
	await unlink(doc.file_path).catch(() => {});

	// Delete from MongoDB
	await deleteDocumentFromDB(documentId);
}

export async function attachDocumentToSession(userName, sessionId, documentId) {
	const doc = await getDocumentById(documentId);
	if (!doc)
		throw Object.assign(new Error("Document not found"), { status: 404 });
	if (doc.user_name !== userName)
		throw Object.assign(new Error("Forbidden"), { status: 403 });
	await updateAttachedDocument(sessionId, documentId);
}

export async function detachDocumentFromSession(userName, sessionId) {
	const session = await getSessionById(sessionId);
	if (!session)
		throw Object.assign(new Error("Session not found"), { status: 404 });
	if (session.user_name !== userName)
		throw Object.assign(new Error("Forbidden"), { status: 403 });
	await clearAttachedDocument(sessionId);
}
