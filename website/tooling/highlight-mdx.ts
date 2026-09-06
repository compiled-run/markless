// Highlights the fenced code blocks in every .mdx route, gives its headings ids
// and writes the "On this page" rail into the page HTML.
//
// Why a plugin over the emitted module rather than over the .mdx source: the
// router's MDX plugin renders markdown to HTML at build time and rejects any
// raw HTML in the source, so highlighted markup cannot be written into the page
// itself. It can only be swapped into the module the router emits.
//
// That module carries the page's static HTML in `marklessMdxParts`, and each
// html part carries an `elementCount`. The runtime adds those counts up to work
// out where each island's elements start, so replacing a part's HTML means
// recounting its elements in the same way. This plugin checks its own counter
// against the count the router wrote before it changes anything, and throws if
// the two disagree, so a future change to the emit shape fails the build instead
// of quietly moving every island by a few elements.
import type { Plugin } from 'vite';
import { countElements, highlightFences } from './highlight-code.ts';

type MdxRoutePart =
	| { readonly kind: 'html'; readonly html: string; readonly elementCount: number }
	| { readonly kind: 'component'; readonly componentIndex: number };

const PARTS_LINE = /^const marklessMdxParts = (\[.*\]);$/m;
const SOLO_HTML = /return \{ html: ("(?:[^"\\]|\\.)*") \};/;
// The emit carries the page HTML as JS string literals, so the quotes around
// the class are escaped there and only this much of the tag is verbatim.
const FENCE_MARKER = '<pre><code class=';
const HEADING_MARKER = '<h2';

/** One entry of the right rail. */
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

/**
 * Gives every h2 and h3 in one chunk of page HTML an `id` and records it, so the
 * rail's links have something to land on. An `id` is an attribute, not an
 * element, so this cannot move the router's element count; the rail markup can,
 * and is counted again where it is injected.
 */
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

/**
 * The "On this page" rail. It is written into the page's own HTML because the
 * document shell cannot reach inside a page module to read its headings; CSS
 * takes it out of the flow and pins it to the right of the prose.
 */
function outlineMarkup(headings: readonly Heading[]): string {
	if (headings.length < 2) return '';
	const items = headings
		.map(
			(heading) =>
				`<li class="on-this-page-item on-this-page-item-h${heading.level}">` +
				`<a class="on-this-page-link" href="#${heading.id}">${heading.html}</a></li>`,
		)
		.join('');
	return (
		'<nav class="on-this-page" aria-label="On this page">' +
		'<p class="on-this-page-title">On this page</p>' +
		`<ul class="on-this-page-list">${items}</ul></nav>`
	);
}

/**
 * Puts the rail just after the page's h1 rather than in front of it. On a wide
 * screen CSS takes the rail out of the flow either way; on a phone it is in the
 * flow, and a reader should meet the page's title before its outline.
 */
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
		// The rail is spliced into the first html part that actually has markup in
		// it. Two components written back to back leave an empty html part between
		// them, and every empty part is the same string — which the literal rewrite
		// below cannot tell apart, so it would put a rail in each of them.
		if (firstHtml < 0 && part.html.trim() !== '') firstHtml = index;
		rewritten.push(collectHeadings(await highlightFences(part.html), seen, headings));
	}
	const outline = outlineMarkup(headings);
	if (outline && firstHtml >= 0) rewritten[firstHtml] = spliceOutline(rewritten[firstHtml] ?? '', outline);
	const nextParts: MdxRoutePart[] = parts.map((part, index) => {
		const html = rewritten[index];
		if (part.kind !== 'html' || html === undefined || html === part.html) return part;
		// One html value, one rewrite. Two parts holding the same string would each
		// take the other's replacement, because what is rewritten in the emitted
		// module is the literal and not the slot.
		if (rewrites.has(part.html))
			throw new Error(
				`highlight-mdx: two parts of ${id} carry the same HTML, so a rewrite of one ` +
					`would land on both. Refusing to rewrite.`,
			);
		rewrites.set(part.html, html);
		return { kind: 'html', html, elementCount: countElements(html) };
	});
	if (rewrites.size === 0) return code;
	let next = code.replace(
		partsLine[0],
		() => `const marklessMdxParts = ${JSON.stringify(nextParts)};`,
	);
	// The same HTML literal is emitted again inside renderSsr and renderCsr.
	for (const [before, after] of rewrites)
		next = next.split(JSON.stringify(before)).join(JSON.stringify(after));
	return next;
}

async function highlightSoloHtml(code: string): Promise<string> {
	// A page with no components emits one `return { html: "…" };` and no parts.
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
		// Object form with a handler: vite-plus does not call a bare `transform`
		// function on this plugin, and a hook that silently never runs is the one
		// failure this whole file cannot detect from the inside.
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
