// Builds the docs search index from each MDX page's own emitted HTML parts, the ones highlight-mdx gave heading ids.
import { existsSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import type { Plugin, ViteDevServer } from 'vite';
import { buildRouteManifestFromFileIds } from '@markless/router';
import { nav, uiNav, type NavSection } from '../nav.ts';
import type { SearchIndex, SearchPart } from '../components/docs/search/search-index.ts';
import { SEARCH_INDEX_FILE } from '../components/docs/search/search-load.ts';
import { PARTS_LINE, SOLO_HTML } from './highlight-mdx.ts';

/** What one page contributes: its h1, and its text cut at every h2 and h3 that carries an id. */
export type PageFacts = { readonly title: string; readonly parts: readonly SearchPart[] };

const SKIPPED = new Set(['script', 'style', 'pre', 'svg', 'markless-outline', 'template', 'button']);
const BLOCK = new Set(['p', 'li', 'td', 'th', 'tr', 'div', 'section', 'blockquote', 'br', 'dt', 'dd', 'h1', 'h2', 'h3', 'h4', 'ul', 'ol', 'table']);
const VOID = new Set(['br', 'img', 'input', 'hr', 'meta', 'link', 'source', 'wbr', 'col', 'area', 'embed', 'track']);
const TOKEN = /<!--[\s\S]*?-->|<(\/?)([a-zA-Z][\w-]*)((?:[^>"']|"[^"]*"|'[^']*')*)>|([^<]+)/g;
const ENTITIES: Readonly<Record<string, string>> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'" };

function decode(text: string): string {
	return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, name: string) => {
		if (name[0] === '#') {
			const code = name[1] === 'x' || name[1] === 'X' ? parseInt(name.slice(2), 16) : Number(name.slice(1));
			return Number.isFinite(code) ? String.fromCodePoint(code) : whole;
		}
		return ENTITIES[name.toLowerCase()] ?? whole;
	});
}

const squash = (text: string) => text.replace(/\s+/g, ' ').trim();

/** Reads one page's HTML parts into its title and sections, skipping code, scripts, drawings and the outline rail. */
export function pageFacts(htmlParts: readonly string[]): PageFacts {
	let title = '';
	const parts: { id: string; heading: string; text: string }[] = [{ id: '', heading: '', text: '' }];
	let skip = 0;
	let capture: 'title' | 'heading' | undefined;
	for (const html of htmlParts) {
		for (const match of html.matchAll(TOKEN)) {
			const [whole, closing, rawName, attributes, text] = match;
			if (whole.startsWith('<!--')) continue;
			const current = parts[parts.length - 1]!;
			if (text !== undefined) {
				if (skip > 0) continue;
				const words = decode(text);
				if (capture === 'title') title += words;
				else if (capture === 'heading') current.heading += words;
				else current.text += words;
				continue;
			}
			const name = rawName!.toLowerCase();
			const selfClosing = attributes!.trimEnd().endsWith('/') || VOID.has(name);
			if (SKIPPED.has(name)) {
				if (!selfClosing) skip += closing ? -1 : 1;
				continue;
			}
			if (skip > 0) continue;
			if (name === 'h1') capture = closing ? undefined : 'title';
			else if (name === 'h2' || name === 'h3') {
				if (closing) capture = undefined;
				else {
					const id = /\sid="([^"]*)"/.exec(attributes!)?.[1];
					if (id !== undefined) {
						parts.push({ id: decode(id), heading: '', text: '' });
						capture = 'heading';
						continue;
					}
				}
			}
			if (BLOCK.has(name) && capture === undefined) current.text += ' ';
		}
	}
	return {
		title: squash(title),
		parts: parts
			.map(({ id, heading, text }) => [id, squash(heading), squash(text)] as SearchPart)
			.filter(([id, , text]) => id !== '' || text !== ''),
	};
}

/** The HTML an MDX route module carries, in either emit shape @markless/router writes, or undefined when it is neither. */
export function htmlPartsOf(code: string): string[] | undefined {
	const parts = PARTS_LINE.exec(code);
	if (parts)
		return (JSON.parse(parts[1]!) as { kind: string; html?: string }[]).flatMap((part) =>
			part.kind === 'html' && part.html ? [part.html] : [],
		);
	const solo = SOLO_HTML.exec(code);
	return solo ? [JSON.parse(solo[1]!) as string] : undefined;
}

/**
 * Every page the sidebars list, in sidebar order, with the facts gathered for it. A page written in
 * .tsrx is indexed by its sidebar title and description; an .mdx page with no facts throws.
 */
export function searchIndex(
	facts: ReadonlyMap<string, PageFacts>,
	isMdx: (href: string) => boolean,
	sections: readonly NavSection[] = [...nav, ...uiNav],
): SearchIndex {
	const missing: string[] = [];
	const pages = sections.flatMap((section) =>
		section.entries.flatMap((entry) => {
			const page = facts.get(entry.href);
			if (!page && isMdx(entry.href)) missing.push(entry.href);
			const parts: readonly SearchPart[] = page?.parts ?? [['', '', entry.description ?? '']];
			return [{ href: entry.href, title: page?.title || entry.title, section: section.title, parts }];
		}),
	);
	if (missing.length > 0)
		throw new Error(`docs-search: no MDX facts for ${missing.join(', ')}. Every sidebar page must be an .mdx route the client build transforms.`);
	return { pages };
}

function routeOf(root: string, file: string): string | undefined {
	const rel = relative(root, file).replaceAll('\\', '/');
	return buildRouteManifestFromFileIds([rel]).routes[0]?.pathname;
}

export function docsSearch(): Plugin[] {
	const facts = new Map<string, PageFacts>();
	let root = process.cwd();
	let base = '/';
	const listedPages = () => new Set([...nav, ...uiNav].flatMap((section) => section.entries.map((entry) => entry.href)));
	const mdxFileOf = (href: string) =>
		[`pages${href === '/' ? '/index' : href}.mdx`, `pages${href}/index.mdx`].find((file) => existsSync(resolve(root, file)));
	const isMdx = (href: string) => mdxFileOf(href) !== undefined;

	async function devIndex(server: ViteDevServer) {
		const client = server.environments.client!;
		const pending = [...listedPages()]
			.filter((href) => !facts.has(href))
			.map(mdxFileOf)
			.flatMap((file) => (file ? [client.transformRequest('/' + file)] : []));
		await Promise.all(pending);
		return searchIndex(facts, isMdx);
	}

	const serve: Plugin = {
		name: 'compiled-website:docs-search-serve',
		// Ahead of the router, whose dev middleware answers every other path.
		enforce: 'pre',
		configResolved(config) {
			root = config.root;
			base = config.base;
		},
		configureServer(server) {
			server.middlewares.use((req, res, next) => {
				const path = (req.url ?? '').split('?', 1)[0]!;
				if (path !== base + SEARCH_INDEX_FILE) return next();
				devIndex(server).then(
					(index) => {
						res.setHeader('content-type', 'application/json; charset=utf-8');
						res.end(JSON.stringify(index));
					},
					(error: unknown) => next(error),
				);
			});
		},
	};
	const collect: Plugin = {
		name: 'compiled-website:docs-search',
		transform: {
			filter: { id: /\.mdx(?:$|\?)/ },
			handler(code, id) {
				if (this.environment?.config.consumer !== 'client') return;
				const file = id.split('?', 1)[0]!;
				if (!file.endsWith('.mdx')) return;
				const html = htmlPartsOf(code);
				const href = routeOf(root, file);
				if (html && href) facts.set(href, pageFacts(html));
			},
		},
		generateBundle() {
			if (this.environment?.config.consumer !== 'client') return;
			this.emitFile({ type: 'asset', fileName: SEARCH_INDEX_FILE, source: JSON.stringify(searchIndex(facts, isMdx)) });
		},
	};
	return [serve, collect];
}
