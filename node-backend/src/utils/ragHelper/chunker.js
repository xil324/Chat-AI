const CHUNK_SIZE = 1500;  // ~512 tokens (chars ÷ ~3)
const OVERLAP    = 200;   // ~50-100 tokens overlap

// CJK unicode ranges
const CJK_REGEX = /[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff]/g;

/**
 * Detect whether text is primarily Chinese, English, or mixed.
 * @param {string} text
 * @returns {'zh'|'en'|'mixed'}
 */
export function detectLanguage(text) {
  if (!text || text.length === 0) return 'en';
  const cjkCount = (text.match(CJK_REGEX) || []).length;
  const ratio = cjkCount / text.length;
  if (ratio > 0.3) return 'zh';
  if (ratio > 0.05) return 'mixed';
  return 'en';
}

/**
 * Split text into overlapping chunks with language detection per chunk.
 * @param {string} text
 * @param {number} chunkSize  characters per chunk
 * @param {number} overlap    characters of overlap
 * @returns {{ content: string, language: string }[]}
 */
export function splitTextWithOverlap(text, chunkSize = CHUNK_SIZE, overlap = OVERLAP) {
  const chunks = [];
  let start = 0;

  while (start < text.length) {
    const end = Math.min(start + chunkSize, text.length);
    const content = text.slice(start, end).trim();
    if (content.length > 0) {
      chunks.push({ content, language: detectLanguage(content) });
    }
    start = start + chunkSize - overlap;
  }

  return chunks;
}