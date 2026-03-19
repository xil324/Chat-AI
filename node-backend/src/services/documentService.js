import { v4 as uuidv4 } from 'uuid';
import { unlink, rename } from 'fs/promises';
import { join, dirname, parse as parsePath } from 'path';
import { fileURLToPath } from 'url';
import { extractTextFromPDF } from '../utils/ragHelper/pdfParser.js';
import { splitTextWithOverlap, detectLanguage } from '../utils/ragHelper/chunker.js';
import { embedBatch } from '../utils/ragHelper/embeddingModel.js';
import { es, CHUNK_INDEX } from '../utils/ragHelper/esClient.js';
import {
  createDocument,
  getDocumentsByUserName,
  getDocumentById,
  deleteDocument as deleteDocumentFromDB,
} from '../dao/documentDao.js';
import {
  getSessionById,
  updateAttachedDocument,
  clearAttachedDocument,
} from '../dao/sessionDao.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const UPLOADS_DIR = join(__dirname, '../../uploads');

export async function uploadDocument(userName, file, meta = {}) {
  const docId = uuidv4();
  const filename = file.originalname;
  const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 200);
  const filePath = join(UPLOADS_DIR, `${docId}_${safeName}`);

  await rename(file.path, filePath);

  const { text } = await extractTextFromPDF(filePath);
  const docLanguage = detectLanguage(text);
  const chunks = splitTextWithOverlap(text);
  const vectors = await embedBatch(chunks.map(c => c.content));

  // Title defaults to filename without extension
  const title = meta.title || parsePath(filename).name.replace(/[_-]/g, ' ');
  const source = meta.source || null;
  const category = meta.category || null;

  const operations = chunks.flatMap((chunk, idx) => [
    { index: { _index: CHUNK_INDEX } },
    {
      doc_id:      docId,
      user_name:   userName,
      chunk_index: idx,
      content:     chunk.content,
      content_en:  chunk.language === 'en' || chunk.language === 'mixed' ? chunk.content : '',
      content_zh:  chunk.language === 'zh' || chunk.language === 'mixed' ? chunk.content : '',
      embedding:   vectors[idx],
      title,
      source,
      category,
      language:    chunk.language,
    },
  ]);

  if (operations.length > 0) {
    await es.bulk({ operations, refresh: false });
  }

  await createDocument({
    id: docId,
    user_name: userName,
    filename,
    file_path: filePath,
    title,
    source,
    category,
    language: docLanguage,
    created_at: new Date(),
  });

  return { id: docId, filename, title, language: docLanguage };
}

export async function listDocuments(userName) {
  const docs = await getDocumentsByUserName(userName);
  return docs?.map(d => ({
    id: d.id,
    filename: d.filename,
    title: d.title,
    source: d.source,
    category: d.category,
    language: d.language,
    created_at: d.created_at,
  }));
}

export async function deleteDocumentById(userName, documentId) {
  const doc = await getDocumentById(documentId);
  if (!doc) throw Object.assign(new Error('Document not found'), { status: 404 });
  if (doc.user_name !== userName) throw Object.assign(new Error('Forbidden'), { status: 403 });

  await es.deleteByQuery({
    index: CHUNK_INDEX,
    query: { term: { doc_id: documentId } },
    refresh: true,
  });

  await unlink(doc.file_path).catch(() => {});
  await deleteDocumentFromDB(documentId);
}

export async function attachDocumentToSession(userName, sessionId, documentId) {
  const doc = await getDocumentById(documentId);
  if (!doc) throw Object.assign(new Error('Document not found'), { status: 404 });
  if (doc.user_name !== userName) throw Object.assign(new Error('Forbidden'), { status: 403 });
  await updateAttachedDocument(sessionId, documentId);
}

export async function detachDocumentFromSession(userName, sessionId) {
  const session = await getSessionById(sessionId);
  if (!session) throw Object.assign(new Error('Session not found'), { status: 404 });
  if (session.user_name !== userName) throw Object.assign(new Error('Forbidden'), { status: 403 });
  await clearAttachedDocument(sessionId);
}