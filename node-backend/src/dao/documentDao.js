import Document from '../models/Document.js';

export async function createDocument(data) {
  return new Document(data).save();
}

export async function getDocumentsByUserName(userName) {
  return Document.find({ user_name: userName }).sort({ created_at: -1 });
}

export async function getDocumentById(id) {
  return Document.findOne({ id });
}

export async function deleteDocument(id) {
  return Document.deleteOne({ id });
}
