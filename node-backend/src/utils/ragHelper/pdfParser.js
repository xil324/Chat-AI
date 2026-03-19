import pdfParse from 'pdf-parse/lib/pdf-parse.js';
import { readFile } from 'fs/promises';

/**
 * Extract text and metadata from a PDF file on disk.
 * @param {string} filePath
 * @returns {{ text: string, title: string|null, date: string|null, pageCount: number }}
 */
export async function extractTextFromPDF(filePath) {
  const buffer = await readFile(filePath);
  const data = await pdfParse(buffer);

  const info = data.info || {};

  // Title: prefer PDF metadata, fall back to first non-blank line of text
  let title = info.Title?.trim() || null;
  if (!title) {
    const firstLine = data.text.split('\n').map(l => l.trim()).find(l => l.length > 3);
    title = firstLine || null;
  }

  // Date: try CreationDate then ModDate; strip D: prefix from PDF date format
  let date = null;
  const rawDate = info.CreationDate || info.ModDate;
  if (rawDate) {
    const cleaned = rawDate.replace(/^D:/, '').slice(0, 8); // YYYYMMDD
    if (/^\d{8}$/.test(cleaned)) {
      date = `${cleaned.slice(0, 4)}-${cleaned.slice(4, 6)}-${cleaned.slice(6, 8)}`;
    }
  }

  return {
    text: data.text,
    title,
    date,
    pageCount: data.numpages,
  };
}