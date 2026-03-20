import { PDFParse } from 'pdf-parse';
import { pathToFileURL } from 'url';

/**
 * Extract text and metadata from a PDF file on disk.
 * @param {string} filePath
 * @returns {{ text: string, title: string|null, date: string|null, pageCount: number }}
 */
export async function extractTextFromPDF(filePath) {
  const parser = new PDFParse({ url: pathToFileURL(filePath).href });

  const [textResult, infoResult] = await Promise.all([
    parser.getText(),
    parser.getInfo(),
  ]);
  await parser.destroy();

  const info = infoResult.info || {};

  // Title: prefer PDF metadata, fall back to first non-blank line of text
  let title = info.Title?.trim() || null;
  if (!title) {
    const firstLine = textResult.text.split('\n').map(l => l.trim()).find(l => l.length > 3);
    title = firstLine || null;
  }

  // Date: try CreationDate then ModDate
  let date = null;
  const dates = infoResult.getDateNode?.() || {};
  const rawDate = dates.CreationDate || dates.ModDate || info.CreationDate || info.ModDate;
  if (rawDate) {
    const cleaned = String(rawDate).replace(/^D:/, '').slice(0, 8); // YYYYMMDD
    if (/^\d{8}$/.test(cleaned)) {
      date = `${cleaned.slice(0, 4)}-${cleaned.slice(4, 6)}-${cleaned.slice(6, 8)}`;
    }
  }

  return {
    text: textResult.text,
    title,
    date,
    pageCount: infoResult.total,
  };
}