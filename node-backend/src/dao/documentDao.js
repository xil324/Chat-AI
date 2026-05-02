import Document from '../models/Document.js';

export async function createDocument(data) {
  return new Document(data).save();
}

export async function getDocumentsByUserName(userName) {
  return Document.find({ user_name: userName }).sort({ created_at: -1 }).lean();
}

export async function getDocumentById(id) {
  return Document.findOne({ id }).lean();
}

export async function getDocumentByHash(userName, contentHash) {
  return Document.findOne({ user_name: userName, content_hash: contentHash }).lean();
}

export async function getDocumentBySourceUrl(userName, sourceUrl) {
  return Document.findOne({ user_name: userName, source_url: sourceUrl }).lean();
}

export async function updateDocument(id, updates) {
  return Document.findOneAndUpdate(
    { id },
    { ...updates, updated_at: new Date() },
    { new: true },
  );
}

export async function deleteDocument(id) {
  return Document.deleteOne({ id });
}
