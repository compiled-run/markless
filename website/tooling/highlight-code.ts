import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createHighlighter, type LanguageRegistration, type HighlighterGeneric } from 'shiki';
import { docForToken, knownTokens, tooltipLabel, tooltipTitle } from './tsrx-docs.ts';
import {
	createQuickInfoService,
	hasQuickInfo,
	type QuickInfo,
	type QuickInfoService,
} from './twoslash-quickinfo.ts';

/** Fence language -> the language shiki is asked for. */
const FENCE_ALIASES: Readonly<Record<string, string>> = {
	bash: 'shellscript',
	js: 'javascript',
	jsx: 'jsx',
	mjs: 'javascript',
	sh: 'shellscript',
	shell: 'shellscript',
	ts: 'typescript',
	zsh: 'shellscript',
};

const LIGHT_THEME = 'github-light';
const DARK_THEME = 'github-dark';

let highlighterPromise: Promise<HighlighterGeneric<string, string>> | undefined;
let quickInfoService: QuickInfoService | undefined;

/** Built on the first fence that could use it: standing up the program costs a moment. */
function quickInfo(): QuickInfoService {
	quickInfoService ??= createQuickInfoService();
	return quickInfoService;
}

export function getHighlighter(): Promise<HighlighterGeneric<string, string>> {
	highlighterPromise ??= (async () => {
		const grammar = JSON.parse(
			await readFile(
				fileURLToPath(new URL('./tsrx.tmLanguage.json', import.meta.url)),
				'utf8',
			),
		) as LanguageRegistration;
		return createHighlighter({
			themes: [LIGHT_THEME, DARK_THEME],
			langs: [
				'javascript',
				'typescript',
				'jsx',
				'tsx',
				'css',
				'html',
				'json',
				'shellscript',
				{ ...grammar, embeddedLangs: ['jsx', 'tsx', 'css'], name: 'tsrx' },
			],
		}) as Promise<HighlighterGeneric<string, string>>;
	})();
	return highlighterPromise;
}

/** Every `<pre><code class="language-x">` block in one chunk of static HTML. */
const FENCE = /<pre><code class="language-([\w+#-]+)">([\s\S]*?)<\/code><\/pre>/g;

/**
 * Counts elements the way the router's MDX plugin counts them: one per element,
 * descendants included. The router uses that number to work out where the
 * islands on the page start, so it has to stay exact.
 */
export function countElements(html: string): number {
	return (html.match(/<[a-zA-Z][^\s/>]*/g) ?? []).length;
}

const NAMED_ENTITIES: Readonly<Record<string, string>> = {
	amp: '&',
	apos: "'",
	gt: '>',
	lt: '<',
	nbsp: '\u00a0',
	quot: '"',
};

function decodeEntities(text: string): string {
	return text.replace(/&(#x[0-9a-fA-F]+|#\d+|[a-zA-Z]+);/g, (match, body: string) => {
		if (body.startsWith('#x') || body.startsWith('#X'))
			return String.fromCodePoint(Number.parseInt(body.slice(2), 16));
		if (body.startsWith('#')) return String.fromCodePoint(Number.parseInt(body.slice(1), 10));
		return NAMED_ENTITIES[body.toLowerCase()] ?? match;
	});
}

function escapeAttribute(text: string): string {
	return text
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;');
}

function escapeText(text: string): string {
	return text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

/**
 * The site's one hover shape: `data-doc-title` is the line shown in bold,
 * `data-doc` the sentence under it, and the inline `.tsrx-tip` is what a reader
 * without a pointer sees. A token with no sentence gets a title-only tip rather
 * than an empty padded strip.
 */
function hoverMarkup(rendered: string, title: string, doc: string, label: string): string {
	return [
		'<span class="tsrx-hover" tabindex="0" role="img"',
		` aria-label="${escapeAttribute(label)}"`,
		` data-doc-title="${escapeAttribute(title)}" data-doc="${escapeAttribute(doc)}">`,
		rendered,
		'<span class="tsrx-tip" aria-hidden="true">',
		`<span class="tsrx-tip-title">${escapeText(title)}</span>`,
		`<span class="tsrx-tip-body">${escapeText(doc)}</span>`,
		'</span></span>',
	].join('');
}

function hoverSpan(token: string, rendered: string): string {
	const doc = docForToken(token);
	if (!doc) return rendered;
	const title = tooltipTitle(token, doc);
	return hoverMarkup(rendered, title, doc.doc, tooltipLabel(token, doc));
}

/** Alternation of every documented token, longest first, ready to embed in a regex. */
const TOKEN_PATTERN = knownTokens()
	.map((token) => token.replace(/[.*+?^${}()|[\]\\{]/g, '\\$&'))
	.join('|');

/**
 * Wraps the TSRX tokens shiki produced in `.tsrx-hover` spans. A token only
 * qualifies when it is the entire text of one shiki span, so a word that merely
 * appears inside a longer run of code is left alone.
 */
export function addTsrxHovers(html: string): string {
	// `@else if` is scoped as two adjacent spans with identical styling. Fuse
	// them so the hover target is the whole phrase rather than half of it.
	const fused = html.replace(
		/(<span style="([^"]*)">)([ \t]*)@else<\/span><span style="\2">([ \t]*)(if\b)/g,
		(_match, open: string, _style: string, lead: string, gap: string, ifWord: string) =>
			`${open}${lead}${hoverSpan('@else if', `@else${gap}${ifWord}`)}`,
	);
	return fused.replace(
		new RegExp(
			`(<span style="[^"]*">)([ \\t]*)(${TOKEN_PATTERN}|on[A-Z][A-Za-z]*)(</span>)`,
			'g',
		),
		(match, open: string, lead: string, token: string, close: string) => {
			const rendered = hoverSpan(token, escapeText(token));
			return rendered === escapeText(token) ? match : `${open}${lead}${rendered}${close}`;
		},
	);
}

/** Text runs and tags, in the order shiki wrote them. */
const HTML_PIECE = /<[^>]*>|[^<]+/g;

/** A hover target has to be one whole word: a run of code, never part of one. */
const WHOLE_TOKEN = /^[\w$.]+$/;

/**
 * Wraps every shiki span whose text is one identifier the type checker resolved.
 * The span's text is matched against the fence source by walking the rendered
 * HTML and counting decoded text, which is exact because shiki emits the code
 * verbatim; a span holding anything but one bare word is left alone, as is any
 * token `tsrx-docs.ts` already explains — those keep the hand-written prose and
 * are wrapped afterwards by `addTsrxHovers`.
 *
 * For a span like `accordion.root`, the hover shows the type of the part the
 * span ends on, which is what an editor shows with the caret on `root`.
 */
export function addQuickInfoHovers(
	html: string,
	code: string,
	infos: readonly QuickInfo[],
): string {
	if (infos.length === 0) return html;
	const byEnd = new Map<number, QuickInfo>();
	for (const info of infos) {
		const end = info.start + info.length;
		const held = byEnd.get(end);
		if (!held || held.length > info.length) byEnd.set(end, info);
	}

	let out = '';
	let offset = 0;
	let open: string | undefined;
	let buffer = '';
	let bufferStart = 0;
	const close = (): string => {
		const text = decodeEntities(buffer);
		const token = text.trim();
		const lead = text.length - text.trimStart().length;
		const plain = `${open}${buffer}</span>`;
		if (!WHOLE_TOKEN.test(token) || docForToken(token)) return plain;
		const start = bufferStart + lead;
		const info = byEnd.get(start + token.length);
		if (!info || info.start < start) return plain;
		const wrapped = hoverMarkup(
			escapeText(token),
			info.signature,
			info.doc,
			info.doc ? `${info.signature}. ${info.doc}` : info.signature,
		);
		return `${open}${buffer.slice(0, lead)}${wrapped}${buffer.slice(lead + token.length)}</span>`;
	};

	for (const piece of html.match(HTML_PIECE) ?? []) {
		if (!piece.startsWith('<')) {
			if (open === undefined) out += piece;
			else buffer += piece;
			offset += decodeEntities(piece).length;
			continue;
		}
		if (open === undefined) {
			if (piece.startsWith('<span style="')) {
				open = piece;
				buffer = '';
				bufferStart = offset;
			} else out += piece;
		} else if (piece === '</span>') {
			out += close();
			open = undefined;
		} else {
			// A tag inside the span means it is no longer one bare word; hand it back.
			out += `${open}${buffer}${piece}`;
			open = undefined;
		}
	}
	return open === undefined ? out : `${out}${open}${buffer}`;
}

/**
 * Drops both themes' own surface colours so the block sits on the site's own
 * ground rather than on a theme's slab: the `<pre>` loses its inline style, and
 * every span painted a theme's default foreground is repainted with the page's
 * ink, in that theme's channel. Token colours are left exactly as the themes
 * chose them.
 */
export function useSiteSurface(
	html: string,
	lightForeground: string,
	darkForeground: string,
): string {
	// Shiki writes hex in the theme's own casing, which is not the casing the
	// theme object reports, so both replacements match without regard to case.
	const hex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	return html
		.replace(/(<pre class="shiki[^"]*")\s+style="[^"]*"/, '$1')
		.replace(new RegExp(`(?<!-)color:${hex(lightForeground)}`, 'gi'), 'color:var(--ink)')
		.replace(
			new RegExp(`--shiki-dark:${hex(darkForeground)}`, 'gi'),
			'--shiki-dark:var(--ink)',
		);
}

/**
 * Replaces every fenced block in one static-HTML chunk. Fences whose language
 * shiki does not know are left exactly as the MDX plugin wrote them.
 */
export async function highlightFences(html: string): Promise<string> {
	if (!FENCE.test(html)) return html;
	FENCE.lastIndex = 0;
	const highlighter = await getHighlighter();
	const loaded = new Set(highlighter.getLoadedLanguages());
	const lightForeground = highlighter.getTheme(LIGHT_THEME).fg;
	const darkForeground = highlighter.getTheme(DARK_THEME).fg;
	return html.replace(FENCE, (match, fenceLanguage: string, encoded: string) => {
		const language = FENCE_ALIASES[fenceLanguage] ?? fenceLanguage;
		if (!loaded.has(language)) return match;
		const code = decodeEntities(encoded).replace(/\n+$/, '');
		const rendered = highlighter.codeToHtml(code, {
			lang: language,
			themes: { light: LIGHT_THEME, dark: DARK_THEME },
			// The light colour stays the span's `color`, so the light output is the
			// single-theme output with one extra custom property beside it.
			defaultColor: 'light',
		});
		// Real types first: the quick-info pass reads the rendered code by counting
		// characters, and the tooltip text `addTsrxHovers` injects is not code.
		const typed = addQuickInfoHovers(
			useSiteSurface(rendered, lightForeground, darkForeground),
			code,
			hasQuickInfo(fenceLanguage) ? quickInfo().queryFence(code, fenceLanguage) : [],
		);
		return addTsrxHovers(typed).replace(
			'<pre class="shiki',
			`<pre data-lang="${fenceLanguage}" class="shiki`,
		);
	});
}
