import { createHash } from "crypto";

const FETCH_TIMEOUT_MS = 10000;
const MAX_HTML_BYTES = 2 * 1024 * 1024;

function createHttpError(message, status) {
	const err = new Error(message);
	err.status = status;
	return err;
}

function normalizeUrl(rawUrl) {
	let parsed;
	try {
		parsed = new URL(rawUrl);
	} catch {
		throw createHttpError("Invalid URL", 400);
	}

	if (!["http:", "https:"].includes(parsed.protocol)) {
		throw createHttpError("Only http and https URLs are supported", 400);
	}

	parsed.hash = "";
	return parsed.toString();
}

function decodeHtmlEntities(text) {
	return text
		.replace(/&nbsp;/g, " ")
		.replace(/&amp;/g, "&")
		.replace(/&lt;/g, "<")
		.replace(/&gt;/g, ">")
		.replace(/&quot;/g, '"')
		.replace(/&#39;/g, "'");
}

function extractTag(html, tagName) {
	const match = html.match(new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)</${tagName}>`, "i"));
	return match ? normalizeText(stripHtml(match[1])) : null;
}

function stripHtml(html) {
	return decodeHtmlEntities(
		html
			.replace(/<script[\s\S]*?<\/script>/gi, " ")
			.replace(/<style[\s\S]*?<\/style>/gi, " ")
			.replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
			.replace(/<svg[\s\S]*?<\/svg>/gi, " ")
			.replace(/<(nav|header|footer|aside)[\s\S]*?<\/\1>/gi, " ")
			.replace(/<br\s*\/?>/gi, "\n")
			.replace(/<\/(p|div|section|article|li|h[1-6])>/gi, "\n")
			.replace(/<[^>]+>/g, " "),
	);
}

function normalizeText(text) {
	return text
		.replace(/\r/g, "\n")
		.replace(/[ \t]+/g, " ")
		.replace(/\n\s+/g, "\n")
		.replace(/\n{3,}/g, "\n\n")
		.trim();
}

function parseLastModified(value) {
	if (!value) return null;
	const date = new Date(value);
	return Number.isNaN(date.getTime()) ? null : date;
}

export function hashText(text) {
	return createHash("sha256").update(text).digest("hex");
}

export async function fetchWebDocument(rawUrl) {
	const url = normalizeUrl(rawUrl);
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

	let response;
	try {
		response = await fetch(url, {
			redirect: "follow",
			signal: controller.signal,
			headers: {
				Accept: "text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.8",
				"User-Agent": "Chat-AI-Regulatory-Connector/1.0",
			},
		});
	} catch (err) {
		throw createHttpError(`Failed to fetch URL: ${err.message}`, 502);
	} finally {
		clearTimeout(timeout);
	}

	if (!response.ok) {
		throw createHttpError(`URL returned ${response.status}`, 502);
	}

	const contentType = response.headers.get("content-type") || "";
	if (!contentType.includes("text/html") && !contentType.includes("text/plain")) {
		throw createHttpError("Only HTML and plain text pages are supported", 400);
	}

	const contentLength = Number.parseInt(response.headers.get("content-length") || "0", 10);
	if (contentLength > MAX_HTML_BYTES) {
		throw createHttpError("Web page is too large to import", 413);
	}

	const body = await response.text();
	if (Buffer.byteLength(body, "utf8") > MAX_HTML_BYTES) {
		throw createHttpError("Web page is too large to import", 413);
	}

	const text = contentType.includes("text/plain")
		? normalizeText(body)
		: normalizeText(stripHtml(body));

	if (!text) {
		throw createHttpError("No extractable text found at URL", 422);
	}

	const title = contentType.includes("text/html")
		? extractTag(body, "title") || extractTag(body, "h1")
		: null;

	return {
		url: response.url || url,
		title,
		text,
		contentHash: hashText(text),
		sourceLastModified: parseLastModified(response.headers.get("last-modified")),
		sourceEtag: response.headers.get("etag"),
	};
}
