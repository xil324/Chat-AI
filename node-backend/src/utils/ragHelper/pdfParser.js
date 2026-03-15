import { PDFParse } from "pdf-parse";
import { readFile } from "fs/promises";

/**
 * Extract full text from a PDF file on disk.
 * Returns concatenated text of all pages.
 */
export async function extractTextFromPDF(filePath) {
	const buffer = await readFile(filePath);
	const parser = new PDFParse({ data: buffer });
	const result = await parser.getText();
	return result.text;
}
