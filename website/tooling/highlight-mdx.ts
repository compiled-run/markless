// Recount rewritten HTML so the router’s island element offsets stay aligned.
import type { Plugin } from 'vite';
import type { MdxRoutePart as RouterMdxRoutePart } from '../../packages/router/src/vite/runtime/mdx-route.ts';
import { countElements, elementTags, highlightFences } from './highlight-code.ts';

type MdxRoutePart = RouterMdxRoutePart & { readonly html: string };

const PARTS_LINE = /^const marklessMdxParts = (\[.*\]);$/m;
const SOLO_HTML = /return \{ html: ("(?:[^"\\]|\\.)*") \};/;
const FENCE_MARKER = '<pre><code class=';
const HEADING_MARKER = '<h2';

type Heading = { readonly level: number; readonly id: string; readonly html: string };

const HEADING = /<h([23])((?:\s[^>]*)?)>([\s\S]*?)<\/h\1>/g;

function slugify(text: string): string {
	return (
		text
			.toLowerCase()
			.replace(/&[^;\s]+;/g, ' ')
			.replace(/[^a-z0-9]+/g, '-')
			.replace(/^-+|-+$/g, '') || 'section'
	);
}

function collectHeadings(html: string, seen: Set<string>, out: Heading[]): string {
	return html.replace(HEADING, (whole, level: string, attributes: string, inner: string) => {
		if (/\sid=/.test(attributes)) return whole;
		const text = inner.replace(/<[^>]+>/g, '').trim();
		const base = slugify(text);
		let id = base;
		for (let n = 2; seen.has(id); n += 1) id = `${base}-${n}`;
		seen.add(id);
		out.push({ level: Number(level), id, html: inner });
		return `<h${level}${attributes} id="${id}">${inner}</h${level}>`;
	});
}

function outlineMarkup(headings: readonly Heading[]): string {
	if (headings.length < 2) return '';
	const items = headings
		.map(
			(heading, index) =>
				`<li class="on-this-page-item on-this-page-item-h${heading.level}" style="--outline-order:${index}">` +
				`<a class="on-this-page-link" href="#${heading.id}">` +
				`<span class="on-this-page-label">${heading.html}</span></a></li>`,
		)
		.join('');
	return (
		'<markless-outline><nav class="on-this-page" aria-label="On this page">' +
		'<p class="on-this-page-title">On this page</p>' +
		`<ul class="on-this-page-list">${items}</ul></nav></markless-outline>`
	);
}

function spliceOutline(html: string, outline: string): string {
	const afterHeading = html.indexOf('</h1>');
	if (afterHeading < 0) return outline + html;
	const at = afterHeading + '</h1>'.length;
	return html.slice(0, at) + outline + html.slice(at);
}

function isMdxRoute(id: string): boolean {
	return id.split('?', 1)[0].endsWith('.mdx');
}

async function highlightParts(code: string, id: string): Promise<string> {
	const partsLine = PARTS_LINE.exec(code);
	if (!partsLine) return code;
	const parts = JSON.parse(partsLine[1]) as MdxRoutePart[];
	const rewrites = new Map<string, string>();
	const headings: Heading[] = [];
	const seen = new Set<string>();
	const rewritten: (string | undefined)[] = [];
	let firstHtml = -1;
	for (const [index, part] of parts.entries()) {
		if (part.kind !== 'html') {
			rewritten.push(undefined);
			continue;
		}
		const counted = countElements(part.html);
		if (counted !== part.elementCount)
			throw new Error(
				`highlight-mdx: element counter disagrees with @markless/router for ${id} ` +
					`(counted ${counted}, part says ${part.elementCount}). Island offsets would move; refusing to rewrite.`,
			);
		if (firstHtml < 0 && part.html.trim() !== '') firstHtml = index;
		rewritten.push(collectHeadings(await highlightFences(part.html), seen, headings));
	}
	const outline = outlineMarkup(headings);
	if (outline && firstHtml >= 0)
		rewritten[firstHtml] = spliceOutline(rewritten[firstHtml] ?? '', outline);
	const nextParts: MdxRoutePart[] = parts.map((part, index) => {
		const html = rewritten[index];
		if (part.kind !== 'html' || html === undefined || html === part.html) return part;
		if (rewrites.has(part.html))
			throw new Error(
				`highlight-mdx: two parts of ${id} carry the same HTML, so a rewrite of one ` +
					`would land on both. Refusing to rewrite.`,
			);
		rewrites.set(part.html, html);
		const tags = elementTags(html);
		return { ...part, html, elementCount: tags.length, elementTags: tags };
	});
	if (rewrites.size === 0) return code;
	let next = code.replace(
		partsLine[0],
		() => `const marklessMdxParts = ${JSON.stringify(nextParts)};`,
	);
	for (const [before, after] of rewrites)
		next = next.split(JSON.stringify(before)).join(JSON.stringify(after));
	return next;
}

async function highlightSoloHtml(code: string): Promise<string> {
	const solo = SOLO_HTML.exec(code);
	if (!solo) return code;
	const headings: Heading[] = [];
	const body = collectHeadings(
		await highlightFences(JSON.parse(solo[1]) as string),
		new Set<string>(),
		headings,
	);
	const html = spliceOutline(body, outlineMarkup(headings));
	return code.replace(solo[0], () => `return { html: ${JSON.stringify(html)} };`);
}

export function highlightMdx(): Plugin {
	return {
		name: 'compiled-website:highlight-mdx',
		transform: {
			async handler(code: string, id: string) {
				if (!isMdxRoute(id)) return;
				const fenced = code.includes(FENCE_MARKER);
				if (!fenced && !code.includes(HEADING_MARKER)) return;
				const known = PARTS_LINE.test(code) || SOLO_HTML.test(code);
				if (fenced && !known)
					throw new Error(
						`highlight-mdx: ${id} carries a code fence but neither emit shape this plugin knows. ` +
							'The @markless/router MDX emit changed; update tooling/highlight-mdx.ts before shipping.',
					);
				if (!known) return;
				const next = PARTS_LINE.test(code)
					? await highlightParts(code, id)
					: await highlightSoloHtml(code);
				return next === code ? undefined : { code: next, map: null };
			},
		},
	};
}
