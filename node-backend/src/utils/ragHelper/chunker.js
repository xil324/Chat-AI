/**
 * Split text into fixed-size chunks with overlap.
 * @param {string} text
 * @param {number} chunkSize - characters per chunk (default 500)
 * @param {number} overlap   - characters of overlap between chunks (default 50)
 * @returns {string[]}
 */
export function splitTextWithOverlap(text, chunkSize = 500, overlap = 50) {
  const chunks = [];
  let start = 0;
  while (start < text.length) {
    const end = Math.min(start + chunkSize, text.length);
    chunks.push(text.slice(start, end).trim());
    start = start + chunkSize - overlap;
  }
  return chunks.filter(c => c.length > 0);
}