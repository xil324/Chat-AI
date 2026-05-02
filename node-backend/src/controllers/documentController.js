import {
	uploadDocument,
	importWebDocument,
	listDocuments,
	getDocumentStatusById,
	deleteDocumentById,
	attachDocumentToSession,
	detachDocumentFromSession,
} from "../services/documentService.js";

export async function handleUpload(req, res) {
	if (!req.file) return res.status(400).json({ error: "No file uploaded" });
	try {
		const result = await uploadDocument(req.user.username, req.file);
		return res.status(result.deduplicated ? 200 : 202).json(result);
	} catch (err) {
		return res.status(err.status || 500).json({ error: err.message });
	}
}

export async function handleImportWeb(req, res) {
	const { url, title, source, category } = req.body;
	if (!url) return res.status(400).json({ error: "url is required" });

	try {
		const result = await importWebDocument(req.user.username, url, {
			title,
			source,
			category,
		});
		return res.status(result.deduplicated ? 200 : 202).json(result);
	} catch (err) {
		return res.status(err.status || 500).json({ error: err.message });
	}
}

export async function handleList(req, res) {
	try {
		const docs = await listDocuments(req.user.username);
		return res.status(200).json({ documents: docs });
	} catch (err) {
		return res.status(500).json({ error: err.message });
	}
}

export async function handleStatus(req, res) {
	const { id } = req.params;
	try {
		const doc = await getDocumentStatusById(req.user.username, id);
		return res.status(200).json(doc);
	} catch (err) {
		return res.status(err.status || 500).json({ error: err.message });
	}
}

export async function handleDelete(req, res) {
	const { id } = req.params;
	try {
		await deleteDocumentById(req.user.username, id);
		return res.status(200).json({ success: true });
	} catch (err) {
		return res.status(err.status || 500).json({ error: err.message });
	}
}

export async function handleAttach(req, res) {
	const { sessionId, documentId } = req.body;
	if (!sessionId || !documentId) {
		return res
			.status(400)
			.json({ error: "sessionId and documentId are required" });
	}
	try {
		await attachDocumentToSession(req.user.username, sessionId, documentId);
		return res.status(200).json({ success: true });
	} catch (err) {
		return res.status(err.status || 500).json({ error: err.message });
	}
}

export async function handleDetach(req, res) {
	const { sessionId } = req.body;
	if (!sessionId)
		return res.status(400).json({ error: "sessionId is required" });
	try {
		await detachDocumentFromSession(req.user.username, sessionId);
		return res.status(200).json({ success: true });
	} catch (err) {
		return res.status(err.status || 500).json({ error: err.message });
	}
}
