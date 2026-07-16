import { joinURL } from 'ufo';
import type { CompilerDiagnostic, SourceSpan } from '@markless/compiler';

export const MARKLESS_DEV_ERROR_EVENT = 'markless:dev-error';
export const MARKLESS_DEV_ERROR_CLEAR_EVENT = 'markless:dev-error-clear';
export const MARKLESS_DEV_ERROR_CLIENT_ID = 'virtual:markless:dev-error-client';

const PLUGIN_CODE_KIND = 'markless-dev-error';
const PLUGIN_CODE_VERSION = 1;

export interface MarklessDevDiagnostic {
	readonly code: string;
	readonly message: string;
	readonly filename?: string;
	readonly line?: number;
	readonly column?: number;
	readonly why?: string;
	readonly suggestion?: string;
	readonly docsUrl?: string;
	readonly frame?: string;
}

export interface MarklessDevErrorPayload {
	readonly version: 1;
	readonly id: string;
	readonly kind: 'compile' | 'runtime';
	readonly diagnostics: readonly MarklessDevDiagnostic[];
	readonly details: string;
	readonly stack?: string;
}

export interface MarklessErrorLocation {
	readonly file?: string;
	readonly line: number;
	readonly column: number;
}

export class MarklessCompileError extends Error {
	readonly payload: MarklessDevErrorPayload;
	readonly id: string;
	readonly loc?: MarklessErrorLocation;
	readonly frame?: string;
	readonly plugin = 'markless';
	readonly pluginCode: string;

	constructor(payload: MarklessDevErrorPayload) {
		super(payload.details);
		this.name = 'MarklessCompileError';
		this.payload = payload.stack || !this.stack ? payload : { ...payload, stack: this.stack };
		this.id = this.payload.id;
		const primary = this.payload.diagnostics[0];
		this.loc =
			primary?.line !== undefined && primary.column !== undefined
				? { file: primary.filename, line: primary.line, column: primary.column }
				: undefined;
		this.frame = primary?.frame;
		this.pluginCode = serializeMarklessDevError(this.payload);
	}
}

export function createCompileErrorPayload(input: {
	readonly filename: string;
	readonly source: string;
	readonly diagnostics: readonly CompilerDiagnostic[];
	readonly details: string;
	readonly stack?: string;
}): MarklessDevErrorPayload {
	return {
		version: 1,
		id: input.filename,
		kind: 'compile',
		diagnostics: input.diagnostics.map((diagnostic) =>
			compilerDiagnostic(input.source, diagnostic),
		),
		details: input.details,
		...(input.stack ? { stack: input.stack } : {}),
	};
}

export function normalizeMarklessDevError(
	error: unknown,
	options: { readonly id?: string } = {},
): MarklessDevErrorPayload {
	if (error instanceof MarklessCompileError) return error.payload;
	if (isObject(error) && isPayload(error.payload)) return error.payload;
	if (isObject(error) && typeof error.pluginCode === 'string') {
		const payload = parseMarklessPluginCode(error.pluginCode);
		if (payload) return payload;
	}

	const details = error instanceof Error ? error.message : String(error);
	const code =
		isObject(error) && typeof error.code === 'string'
			? error.code
			: 'MARKLESS_DEV_RUNTIME_ERROR';
	return {
		version: 1,
		id: options.id ?? 'navigation:unknown',
		kind: 'runtime',
		diagnostics: [{ code, message: details }],
		details,
		...(error instanceof Error && error.stack ? { stack: error.stack } : {}),
	};
}

export function serializeMarklessDevError(payload: MarklessDevErrorPayload): string {
	return JSON.stringify({
		kind: PLUGIN_CODE_KIND,
		version: PLUGIN_CODE_VERSION,
		payload,
	});
}

export function formatMarklessSourceFrame(source: string, span: SourceSpan): string {
	const lines = source.split('\n');
	const start = sourcePosition(source, span.start);
	const end = sourcePosition(source, Math.max(span.start, span.end));
	const firstLine = Math.max(1, start.line - 2);
	const lastLine = Math.min(lines.length, start.line + 2);
	const width = String(lastLine).length;
	const frame: string[] = [];
	for (let line = firstLine; line <= lastLine; line += 1) {
		const active = line === start.line;
		const text = lines[line - 1] ?? '';
		frame.push(`${active ? '>' : ' '} ${String(line).padStart(width)} | ${text}`);
		if (active) {
			const firstLineEnd = start.line === end.line ? end.column : text.length + 1;
			const caretLength = Math.max(1, firstLineEnd - start.column);
			frame.push(
				`  ${' '.repeat(width)} | ${' '.repeat(start.column - 1)}${'^'.repeat(caretLength)}`,
			);
		}
	}
	return frame.join('\n');
}

export function renderMarklessDevErrorDocument(
	payload: MarklessDevErrorPayload,
	options: { readonly base?: string } = {},
): string {
	const primary = payload.diagnostics[0] ?? {
		code: 'MARKLESS_DEV_RUNTIME_ERROR',
		message: payload.details,
	};
	const diagnostics = payload.diagnostics.slice(1).map((diagnostic) => {
		return `<details><summary>${escapeHtml(`${diagnostic.code} — ${diagnostic.message}`)}</summary>${renderDiagnosticBody(diagnostic, options.base ?? '/')}</details>`;
	});
	const technical = [payload.details, payload.stack].filter(Boolean).join('\n\n');
	const serialized = JSON.stringify(payload).replaceAll('<', '\\u003c');
	return `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(primary.code)} — Markless development error</title><style>${documentStyles}</style></head>
<body><main class="panel"><header><span class="badge">${escapeHtml(primary.code)}</span><h1>${escapeHtml(primary.message)}</h1></header>
${renderDiagnosticBody(primary, options.base ?? '/')}
${diagnostics.join('\n')}
<details><summary>Technical details</summary><pre>${escapeHtml(technical)}</pre></details>
<p class="recovery">Fix the error and reload to continue.</p></main>
<script>window.__MARKLESS_DEV_ERROR__ = ${serialized};</script></body></html>`;
}

export function renderMarklessDevErrorPlainText(payload: MarklessDevErrorPayload): string {
	return [payload.details, payload.stack].filter(Boolean).join('\n\n');
}

function compilerDiagnostic(source: string, diagnostic: CompilerDiagnostic): MarklessDevDiagnostic {
	const position = diagnostic.primarySpan
		? sourcePosition(source, diagnostic.primarySpan.start)
		: undefined;
	return {
		code: diagnostic.code,
		message: diagnostic.message,
		...(diagnostic.primarySpan ? { filename: diagnostic.primarySpan.filename } : {}),
		...(position ? { line: position.line, column: position.column } : {}),
		...(diagnostic.why ? { why: diagnostic.why } : {}),
		...(diagnostic.suggestions[0]?.message
			? { suggestion: diagnostic.suggestions[0].message }
			: {}),
		...(diagnostic.docsUrl ? { docsUrl: diagnostic.docsUrl } : {}),
		...(diagnostic.primarySpan
			? { frame: formatMarklessSourceFrame(source, diagnostic.primarySpan) }
			: {}),
	};
}

function sourcePosition(source: string, offset: number) {
	const before = source.slice(0, Math.max(0, Math.min(offset, source.length)));
	const lastLineBreak = before.lastIndexOf('\n');
	return {
		line: before.split('\n').length,
		column: before.length - lastLineBreak,
	};
}

function parseMarklessPluginCode(value: string): MarklessDevErrorPayload | undefined {
	try {
		const envelope: unknown = JSON.parse(value);
		if (
			isObject(envelope) &&
			envelope.kind === PLUGIN_CODE_KIND &&
			envelope.version === PLUGIN_CODE_VERSION &&
			isPayload(envelope.payload)
		) {
			return envelope.payload;
		}
	} catch {
		// A foreign pluginCode value is handled by the runtime fallback.
	}
	return undefined;
}

function isPayload(value: unknown): value is MarklessDevErrorPayload {
	return (
		isObject(value) &&
		value.version === 1 &&
		typeof value.id === 'string' &&
		(value.kind === 'compile' || value.kind === 'runtime') &&
		Array.isArray(value.diagnostics) &&
		typeof value.details === 'string'
	);
}

function isObject(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null;
}

function renderDiagnosticBody(diagnostic: MarklessDevDiagnostic, base: string): string {
	const location =
		diagnostic.filename && diagnostic.line !== undefined && diagnostic.column !== undefined
			? `<a class="location" href="${escapeAttribute(joinURL(base, `/__open-in-editor?file=${encodeURIComponent(diagnostic.filename)}`))}">${escapeHtml(`${diagnostic.filename}:${diagnostic.line}:${diagnostic.column}`)}</a>`
			: '';
	const why = diagnostic.why
		? `<section><h2>Why</h2><p>${escapeHtml(diagnostic.why)}</p></section>`
		: '';
	const suggestion = diagnostic.suggestion
		? `<section><h2>Suggested fix</h2><p>${escapeHtml(diagnostic.suggestion)}</p></section>`
		: '';
	const frame = diagnostic.frame
		? `<pre class="frame">${escapeHtml(diagnostic.frame)}</pre>`
		: '';
	const docs = diagnostic.docsUrl
		? `<p><a href="${escapeAttribute(diagnostic.docsUrl)}">Read ${escapeHtml(diagnostic.code)} documentation</a></p>`
		: '';
	return `${location}${why}${suggestion}${frame}${docs}`;
}

function escapeHtml(value: string): string {
	return value
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;')
		.replaceAll("'", '&#39;');
}

function escapeAttribute(value: string): string {
	return escapeHtml(value);
}

const documentStyles = `
:root{color-scheme:light dark;font-family:system-ui,sans-serif;background:Canvas;color:CanvasText}
*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;padding:clamp(1rem,4vw,3rem);background:color-mix(in srgb,Canvas 94%,#b42318 6%)}
.panel{width:min(60rem,100%);padding:clamp(1.25rem,3vw,2.5rem);border:1px solid color-mix(in srgb,CanvasText 20%,transparent);border-top:4px solid #c9362b;border-radius:.5rem;background:Canvas;box-shadow:0 1rem 3rem #0002}
header{display:flex;flex-direction:column;gap:.6rem;margin-bottom:1rem}.badge{align-self:flex-start;padding:.15rem .45rem;border-radius:.25rem;background:color-mix(in srgb,#c9362b 14%,Canvas);color:#c9362b;font:600 .75rem ui-monospace,monospace}h1{margin:0;font-size:clamp(1.4rem,3vw,2rem);line-height:1.2}h2{margin:1rem 0 .25rem;font-size:.8rem;text-transform:uppercase;letter-spacing:.06em;color:color-mix(in srgb,CanvasText 65%,transparent)}p{margin:.3rem 0 1rem;line-height:1.55}a{color:LinkText}.location{display:inline-block;margin-bottom:.5rem;font:500 .9rem ui-monospace,monospace}.frame,details pre{overflow:auto;padding:1rem;border-radius:.35rem;background:color-mix(in srgb,CanvasText 7%,Canvas);font: .85rem/1.55 ui-monospace,monospace;white-space:pre}details{margin-top:1rem;border-top:1px solid color-mix(in srgb,CanvasText 15%,transparent);padding-top:1rem}summary{cursor:pointer;font-weight:600}.recovery{margin:1.5rem 0 0;color:color-mix(in srgb,CanvasText 65%,transparent);font-size:.9rem}`;
