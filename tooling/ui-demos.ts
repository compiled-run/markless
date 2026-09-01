// One import line per family instead of one per demo.
//
// `components/demos/ui/<family>/<example>.tsrx` is the whole convention:
// `basic.tsrx` is the hero, every other file is a named example, and the
// exported name is the file name in PascalCase (`find` -> `Find`,
// `until-found` -> `UntilFound`).
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, relative, resolve } from 'node:path';
import type { Plugin } from 'vite';
import { highlightFences } from './highlight-code.ts';
import { codePanelModule, codePanelName, codePanelPath, type PanelPane } from './ui-code-panel.ts';
import { CHROME_CSS } from './ui-playground-css.ts';
import {
	analyzeDemo,
	codeSlots,
	componentName,
	displaySource,
	generatedPath,
	playgroundControls,
	playgroundModule,
} from './ui-playground.ts';
import { metaFor } from '../components/docs/ui-meta/index.ts';

const PREFIX = 'ui-demos:';
const VIRTUAL = '\0ui-demos:';
const DEMOS_DIR = 'components/demos/ui';
const FAMILY = /^[a-z][a-z0-9-]*$/;

/** `basic` -> `Basic`, `until-found` -> `UntilFound`. */
function exportName(stem: string): string {
	return stem
		.split('-')
		.map((word) => word.charAt(0).toUpperCase() + word.slice(1))
		.join('');
}

type Demo = { readonly stem: string; readonly name: string; readonly file: string };

function readFamily(root: string, family: string): Demo[] {
	const dir = join(root, DEMOS_DIR, family);
	let entries: string[];
	try {
		entries = readdirSync(dir);
	} catch {
		throw new Error(
			`ui-demos: no demo folder for '${family}'. Expected ${DEMOS_DIR}/${family}/ with one .tsrx per example.`,
		);
	}
	const demos = entries
		.filter((entry) => entry.endsWith('.tsrx'))
		.sort()
		.map((entry) => {
			const stem = basename(entry, '.tsrx');
			return { stem, name: exportName(stem), file: join(dir, entry) };
		});
	if (demos.length === 0) throw new Error(`ui-demos: ${DEMOS_DIR}/${family}/ holds no .tsrx demos.`);
	return demos;
}

/** One run of code, coloured and nothing else. */
export type CodeRun = {
	/** Unique within its line, because `@for` needs a key and two runs can read alike. */
	readonly id: string;
	readonly text: string;
	/** Shiki's inline colours, light plus the `--shiki-dark` channel. Empty when unstyled. */
	readonly style: string;
};

/** A run the highlighter documented, carrying everything its hover doc needs. */
export type HoverRun = CodeRun & {
	/** The line shown in bold at the top of the doc. */
	readonly title: string;
	/** The sentence under it. Empty when the token has none. */
	readonly doc: string;
	/** What a screen reader is told the hover says. */
	readonly label: string;
};

/**
 * One run of code the panel draws. Exactly one list is filled; a repeat over the
 * empty one draws nothing, which is how the panel picks a shape without `@if`.
 */
export type CodeToken = {
	readonly id: string;
	readonly plain: readonly CodeRun[];
	readonly hover: readonly HoverRun[];
};

/** One source line. `id` exists because `@for` needs a key. */
export type CodeLine = { readonly id: string; readonly tokens: readonly CodeToken[] };

/** One pane of the code panel: the scenario file, or the CSS lifted out of it. */
export type CodePane = {
	readonly value: string;
	/** What the tab strip shows — the file's own name, never a fixed label. */
	readonly label: string;
	readonly lines: readonly CodeLine[];
};

const STYLE_BLOCK = /^[ \t]*<style>[ \t]*\n([\s\S]*?)\n[ \t]*<\/style>[ \t]*\n?/m;

const ENTITIES: Readonly<Record<string, string>> = {
	amp: '&',
	apos: "'",
	gt: '>',
	lt: '<',
	nbsp: ' ',
	quot: '"',
};

function decodeEntities(text: string): string {
	return text.replace(/&(#x[0-9a-fA-F]+|#\d+|[a-zA-Z]+);/g, (match, body: string) => {
		if (body.startsWith('#x') || body.startsWith('#X'))
			return String.fromCodePoint(Number.parseInt(body.slice(2), 16));
		if (body.startsWith('#')) return String.fromCodePoint(Number.parseInt(body.slice(1), 10));
		return ENTITIES[body.toLowerCase()] ?? match;
	});
}

function escapeHtml(text: string): string {
	return text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

const TAG_OR_TEXT = /<(\/?)([a-zA-Z][\w-]*)((?:"[^"]*"|[^">])*)>|([^<]+)/g;
const ATTRIBUTE = /([\w:-]+)="([^"]*)"/g;

type Frame = {
	readonly style: string;
	readonly title?: string;
	readonly doc?: string;
	readonly label?: string;
	readonly quiet: boolean;
};

/** A run as the parser accumulates it, before it is sorted into the two lists. */
type RawToken = {
	text: string;
	readonly style: string;
	readonly title?: string;
	readonly doc?: string;
	readonly label?: string;
};

function paint(raw: RawToken, index: number): CodeToken {
	const id = `t${index}`;
	const run = { id, text: raw.text, style: raw.style };
	if (raw.title === undefined || raw.title === '') return { id, plain: [run], hover: [] };
	return {
		id,
		plain: [],
		hover: [{ ...run, title: raw.title, doc: raw.doc ?? '', label: raw.label ?? raw.title }],
	};
}

/**
 * Reads the highlighter's own markup back into data the panel can draw with
 * `@for`. Markless has no way to drop a string of HTML into a component, so the
 * spans shiki wrote — and the `.tsrx-hover` wrappers `highlight-code.ts` puts
 * around documented tokens — have to come back as values, not as text.
 *
 * Nesting is followed generically rather than shape-matched, so markup this file
 * has not met keeps its text and simply loses the decoration it did not name.
 */
function parseHighlighted(html: string): CodeLine[] {
	const opened = html.indexOf('<code');
	const start = opened < 0 ? -1 : html.indexOf('>', opened);
	const end = html.lastIndexOf('</code>');
	const body = start < 0 || end < 0 ? html : html.slice(start + 1, end);
	return body.split('\n').map((raw, index) => {
		const stack: Frame[] = [{ style: '', quiet: false }];
		const tokens: RawToken[] = [];
		TAG_OR_TEXT.lastIndex = 0;
		for (const match of raw.matchAll(TAG_OR_TEXT)) {
			const [, closing, , attributes, text] = match;
			const top = stack[stack.length - 1];
			if (text !== undefined) {
				if (top.quiet) continue;
				const content = decodeEntities(text);
				const last = tokens[tokens.length - 1];
				if (
					last &&
					last.style === top.style &&
					last.title === top.title &&
					last.doc === top.doc &&
					last.label === top.label
				)
					last.text += content;
				else
					tokens.push({
						text: content,
						style: top.style,
						title: top.title,
						doc: top.doc,
						label: top.label,
					});
				continue;
			}
			if (closing === '/') {
				if (stack.length > 1) stack.pop();
				continue;
			}
			const attrs = new Map<string, string>();
			for (const attribute of (attributes ?? '').matchAll(ATTRIBUTE))
				attrs.set(attribute[1], decodeEntities(attribute[2]));
			const className = attrs.get('class') ?? '';
			stack.push({
				style: attrs.get('style') ?? top.style,
				title: attrs.get('data-doc-title') ?? top.title,
				doc: attrs.get('data-doc') ?? top.doc,
				label: attrs.get('aria-label') ?? top.label,
				// The tip is the hover's own copy of the text; drawing it here would
				// print every documented token twice.
				quiet: top.quiet || className.split(/\s+/).includes('tsrx-tip'),
			});
		}
		return { id: `l${index}`, tokens: tokens.map(paint) };
	});
}

/**
 * Runs one block through the site's own fence highlighter, so a code panel and a
 * code fence on the same page are coloured by one pipeline rather than two.
 */
async function highlightBlock(code: string, language: string): Promise<CodeLine[]> {
	const fence = `<pre><code class="language-${language}">${escapeHtml(code)}</code></pre>`;
	return parseHighlighted(await highlightFences(fence));
}

/** Drops the common leading tabs a `<style>` block carries from its indentation. */
function dedent(css: string): string {
	const lines = css.split('\n');
	let indent = Number.POSITIVE_INFINITY;
	for (const line of lines) {
		if (line.trim() === '') continue;
		indent = Math.min(indent, line.length - line.trimStart().length);
	}
	if (!Number.isFinite(indent) || indent === 0) return css.trimEnd();
	return lines.map((line) => line.slice(indent)).join('\n').trimEnd();
}

/**
 * Splits a demo into the file a reader should copy and the CSS behind it.
 *
 * The `<style>` block is lifted textually. yuku's TSRX parser does model it —
 * `JSXStyleElement.css` on a parsed program — but `yuku-tsrx` is a dependency of
 * @markless/router rather than one this site declares, so it is not resolvable
 * from here without a package.json change.
 */
function splitDemo(source: string): { readonly code: string; readonly css: string } {
	const found = STYLE_BLOCK.exec(source);
	if (!found) return { code: source.trimEnd(), css: '' };
	const code = `${source.slice(0, found.index).trimEnd()}\n${source.slice(found.index + found[0].length)}`;
	return { code: code.trimEnd(), css: dedent(found[1]) };
}

/**
 * Static imports and re-exports only. Each demo stays an ordinary .tsrx module
 * the Markless compiler sees on its own, and the family module is nothing but
 * bindings pointing at them.
 */
function moduleSource(demos: readonly Demo[]): string {
	const lines = demos.map(
		(demo, index) => `import demo${index} from ${JSON.stringify(demo.file)};`,
	);
	lines.push(
		`export { ${demos.map((demo, index) => `demo${index} as ${demo.name}`).join(', ')} };`,
	);
	// Inlined rather than imported with ?raw: the source text is what a page puts
	// in a code fence, and reading it here keeps the demo a single .tsrx module in
	// the graph instead of two.
	lines.push(
		`export const source = {${demos
			.map((demo) => `${JSON.stringify(demo.stem)}: ${JSON.stringify(readFileSync(demo.file, 'utf8'))}`)
			.join(', ')}};`,
	);
	return `${lines.join('\n')}\n`;
}

/**
 * Rewrites `import { Basic, Find } from 'ui-demos:accordion'` in an .mdx page
 * into the default imports the page would otherwise spell out by hand.
 *
 * This is a source rewrite and not virtual-module resolution because
 * @markless/router's MDX transform parses the page's own import statements and
 * accepts default imports from `.tsrx` specifiers only — a named import from a
 * bare specifier is refused before Vite resolution is ever reached.
 */
function expandMdxImports(code: string, id: string, root: string, watch: (file: string) => void): string | undefined {
	const pattern = /^import\s*\{([^}]*)\}\s*from\s*['"]ui-demos:([^'"]+)['"];?[ \t]*$/gm;
	let changed = false;
	const next = code.replace(pattern, (whole, names: string, family: string) => {
		if (!FAMILY.test(family))
			throw new Error(`ui-demos: '${family}' is not a family folder name (${id}).`);
		const demos = readFamily(root, family);
		const byName = new Map(demos.map((demo) => [demo.name, demo]));
		const from = dirname(id.split('?', 1)[0]);
		const wanted = names
			.split(',')
			.map((name) => name.trim())
			.filter((name) => name !== '');
		if (wanted.length === 0) return whole;
		changed = true;
		for (const demo of demos) watch(demo.file);
		return wanted
			.map((name) => {
				if (/\s/.test(name))
					throw new Error(
						`ui-demos: '${name}' renames a demo import, which ${id} cannot do; use the file's own name.`,
					);
				const demo = byName.get(name);
				if (!demo)
					throw new Error(
						`ui-demos: ${DEMOS_DIR}/${family}/ has no demo exporting '${name}'. It holds ${demos
							.map((entry) => entry.name)
							.join(', ')}.`,
					);
				let specifier = relative(from, demo.file);
				if (!specifier.startsWith('.')) specifier = `./${specifier}`;
				return `import ${name} from ${JSON.stringify(specifier)};`;
			})
			.join('\n');
	});
	return changed ? next : undefined;
}

// `<CodePanel scenario="accordion/basic" />` in an .mdx page. The family and the
// demo file are named in the page; the panel behind it is generated below.
const SCENARIO_TAG =
	/<([A-Z][A-Za-z0-9]*)((?:[^>"]|"[^"]*")*?)\sscenario="([a-z][a-z0-9-]*)\/([a-z0-9-]+)"((?:[^>"]|"[^"]*")*?)\/>/g;

/**
 * Writes a generated module only when its text changed. Pages are transformed
 * in parallel with the modules they name being loaded, and rewriting an
 * unchanged file truncates it for a moment that a concurrent load can land in.
 */
function writeGenerated(file: string, text: string): void {
	try {
		if (readFileSync(file, 'utf8') === text) return;
	} catch {}
	mkdirSync(dirname(file), { recursive: true });
	writeFileSync(file, text);
}

/** A page-relative specifier for a generated module. */
function specifierFrom(id: string, file: string): string {
	const specifier = relative(dirname(id.split('?', 1)[0]), file);
	return specifier.startsWith('.') ? specifier : `./${specifier}`;
}

/** Drops `import Name from '…'` once the page no longer renders `<Name`. */
function dropUnusedImport(code: string, name: string): string {
	if (new RegExp(`<${name}\\b`).test(code)) return code;
	return code.replace(new RegExp(`^import\\s+${name}\\s+from\\s+['"][^'"]+['"];?[ \\t]*\\n`, 'm'), '');
}

/**
 * `<CodePanel scenario="accordion/multiple" />` in an .mdx page. The panel is
 * generated from the demo the page names — the code as literal markup, the
 * chrome the playground uses — and written to disk as its own module, so the
 * page carries the import of that module and the element. The `CodePanel`
 * import the page wrote goes with the tag once nothing renders it.
 */
async function injectCodePanels(
	code: string,
	id: string,
	root: string,
	watch: (file: string) => void,
): Promise<string | undefined> {
	const matches = [...code.matchAll(SCENARIO_TAG)].filter((match) => match[1] !== 'Playground');
	if (matches.length === 0) return undefined;
	const imports = new Map<string, string>();
	const swaps = new Map<string, string>();
	const tags = new Set<string>();
	for (const match of matches) {
		const [whole, tag, , family, stem] = match;
		if (swaps.has(whole)) continue;
		tags.add(tag);
		const demo = readFamily(root, family).find((entry) => entry.stem === stem);
		if (!demo)
			throw new Error(
				`ui-demos: ${DEMOS_DIR}/${family}/ has no '${stem}.tsrx' for the code panel in ${id}.`,
			);
		watch(demo.file);
		const { code: source, css } = splitDemo(readFileSync(demo.file, 'utf8'));
		const panes: PanelPane[] = [
			{ value: 'source', label: `${demo.stem}.tsrx`, code: source, language: 'tsrx' },
		];
		if (css !== '') panes.push({ value: 'css', label: `${family}.css`, code: css, language: 'css' });
		const file = codePanelPath(root, family, stem);
		writeGenerated(file, await codePanelModule({ family, stem, panes }));
		const local = codePanelName(family, stem);
		imports.set(local, specifierFrom(id, file));
		swaps.set(whole, `<${local} />`);
	}
	let next = code;
	for (const [before, after] of swaps) next = next.split(before).join(after);
	for (const tag of tags) next = dropUnusedImport(next, tag);
	const lines = [...imports].map(
		([local, specifier]) => `import ${local} from ${JSON.stringify(specifier)};`,
	);
	// The blank line matters: MDX reads an import touching the next line as prose.
	return `${lines.join('\n')}\n\n${next}`;
}

/**
 * `<Playground scenario="accordion/basic" />` in an .mdx page. The card behind it
 * is generated from the demo the page names, so the page carries the import of
 * the generated module and the element, and nothing else.
 */
async function injectPlaygrounds(
	code: string,
	id: string,
	root: string,
	watch: (file: string) => void,
): Promise<string | undefined> {
	const matches = [...code.matchAll(SCENARIO_TAG)].filter((match) => match[1] === 'Playground');
	if (matches.length === 0) return undefined;
	const imports = new Map<string, string>();
	const swaps = new Map<string, string>();
	for (const match of matches) {
		const [whole, , , family, stem] = match;
		const demo = readFamily(root, family).find((entry) => entry.stem === stem);
		if (!demo)
			throw new Error(
				`ui-playground: ${DEMOS_DIR}/${family}/ has no '${stem}.tsrx' for the playground in ${id}.`,
			);
		watch(demo.file);
		const file = generatedPath(root, family, stem);
		writeGenerated(file, await playgroundSource(root, family, stem, watch));
		const local = componentName(family, stem);
		imports.set(local, specifierFrom(id, file));
		swaps.set(whole, `<${local} />`);
	}
	let next = code;
	for (const [before, after] of swaps) next = next.split(before).join(after);
	const lines = [...imports].map(
		([local, specifier]) => `import ${local} from ${JSON.stringify(specifier)};`,
	);
	// The blank line matters: MDX reads an import touching the next line as prose.
	return `${lines.join('\n')}\n\n${next}`;
}

/** The generated module's text: chrome, demo and code panel in one island. */
async function playgroundSource(root: string, family: string, stem: string, watch: (file: string) => void): Promise<string> {
	const demo = readFamily(root, family).find((entry) => entry.stem === stem);
	if (!demo)
		throw new Error(`ui-playground: ${DEMOS_DIR}/${family}/ has no '${stem}.tsrx' to build a playground from.`);
	watch(demo.file);
	const analysis = await analyzeDemo(family, stem, demo.file);
	const meta = metaFor(family);
	const controls = playgroundControls(analysis, meta);
	const slots = codeSlots(analysis, controls);
	return playgroundModule({
		demo: analysis,
		meta,
		controls,
		slots,
		sourceLines: await highlightBlock(displaySource(analysis, slots), 'tsrx'),
		cssLines: analysis.css === '' ? [] : await highlightBlock(analysis.css, 'css'),
		sourceLabel: `${stem}.tsrx`,
		cssLabel: `${family}.css`,
		chromeCss: CHROME_CSS,
	});
}

export function uiDemos(): Plugin {
	let root = process.cwd();
	return {
		name: 'compiled-website:ui-demos',
		// Ahead of @markless/router's MDX transform, which reads the page's import
		// statements out of the .mdx source before anything else runs.
		enforce: 'pre',
		configResolved(config) {
			root = config.root;
		},
		configureServer(server) {
			const dir = resolve(root, DEMOS_DIR);
			server.watcher.add(dir);
			const invalidate = (file: string) => {
				if (!file.startsWith(dir) || !file.endsWith('.tsrx')) return;
				const family = relative(dir, file).split('/')[0];
				const virtual = server.moduleGraph.getModuleById(VIRTUAL + family);
				if (virtual) server.moduleGraph.invalidateModule(virtual);
				// A page's expanded import list is baked into its transform result,
				// so adding or removing a demo has to re-run that transform too.
				for (const module of server.moduleGraph.getModulesByFile(file) ?? [])
					for (const importer of module.importers) server.moduleGraph.invalidateModule(importer);
			};
			server.watcher.on('add', invalidate);
			server.watcher.on('unlink', invalidate);
		},
		resolveId(source) {
			if (!source.startsWith(PREFIX)) return;
			const family = source.slice(PREFIX.length);
			if (!FAMILY.test(family)) throw new Error(`ui-demos: '${family}' is not a family folder name.`);
			return VIRTUAL + family;
		},
		load(id) {
			if (!id.startsWith(VIRTUAL)) return;
			const family = id.slice(VIRTUAL.length);
			const demos = readFamily(root, family);
			for (const demo of demos) this.addWatchFile(demo.file);
			return moduleSource(demos);
		},
		transform: {
			order: 'pre',
			async handler(code: string, id: string) {
				if (!id.split('?', 1)[0].endsWith('.mdx')) return;
				const watch = (file: string) => this.addWatchFile(file);
				const expanded = code.includes(PREFIX)
					? expandMdxImports(code, id, root, watch)
					: undefined;
				const played = await injectPlaygrounds(expanded ?? code, id, root, watch);
				const next = await injectCodePanels(played ?? expanded ?? code, id, root, watch);
				const result = next ?? played ?? expanded;
				return result === undefined ? undefined : { code: result, map: null };
			},
		},
	};
}
