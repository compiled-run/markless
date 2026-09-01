// One import line per family instead of one per demo.
//
// `components/demos/ui/<family>/<example>.tsrx` is the whole convention:
// `basic.tsrx` is the hero, every other file is a named example, and the
// exported name is the file name in PascalCase (`find` -> `Find`,
// `until-found` -> `UntilFound`).
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, relative, resolve } from 'node:path';
import type { Plugin } from 'vite';
import {
	codePanelModule,
	codePanelName,
	codePanelPath,
	exampleName,
	examplePath,
	type PanelPane,
} from './ui-code-panel.ts';
import { ColourTable, DocRegistry, highlightHtml, paneLines } from './ui-code-runs.ts';
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

// `<Example scenario="accordion/basic" />` in an .mdx page. The family and the
// demo file are named in the page; the card behind it is generated below.
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

/** The two files a demo is made of, as the code chrome tabs them. */
function panesOf(family: string, demo: Demo): PanelPane[] {
	const { code, css } = splitDemo(readFileSync(demo.file, 'utf8'));
	const panes: PanelPane[] = [{ value: 'source', label: `${demo.stem}.tsrx`, code, language: 'tsrx' }];
	if (css !== '') panes.push({ value: 'css', label: `${family}.css`, code: css, language: 'css' });
	return panes;
}

/**
 * The `scenario="family/demo"` tags an .mdx page writes, each swapped for a
 * module generated from the demo it names and written to disk, so the page
 * carries the import of that module and the element:
 *
 * - `<Playground scenario=… />`: the hero card — controls, stage, code panel;
 * - `<Example scenario=… />`: the demo on a stage above its code panel, one card;
 * - `<CodePanel scenario=… />`: the code panel alone.
 *
 * `Playground` and `Example` are the build's own names; a `CodePanel` import
 * the page wrote goes with the tag once nothing renders it.
 */
async function injectScenarioTags(
	code: string,
	id: string,
	root: string,
	watch: (file: string) => void,
): Promise<string | undefined> {
	const matches = [...code.matchAll(SCENARIO_TAG)];
	if (matches.length === 0) return undefined;
	const imports = new Map<string, string>();
	const swaps = new Map<string, string>();
	const tags = new Set<string>();
	for (const match of matches) {
		const [whole, tag, , family, stem] = match;
		if (swaps.has(whole)) continue;
		const demo = readFamily(root, family).find((entry) => entry.stem === stem);
		if (!demo)
			throw new Error(`ui-demos: ${DEMOS_DIR}/${family}/ has no '${stem}.tsrx' for the <${tag}> in ${id}.`);
		watch(demo.file);
		let file: string;
		let local: string;
		if (tag === 'Playground') {
			file = generatedPath(root, family, stem);
			local = componentName(family, stem);
			writeGenerated(file, await playgroundSource(root, family, stem, watch));
		} else if (tag === 'Example') {
			file = examplePath(root, family, stem);
			local = exampleName(family, stem);
			writeGenerated(file, await codePanelModule({ family, stem, panes: panesOf(family, demo), demo: specifierFrom(file, demo.file) }));
		} else {
			tags.add(tag);
			file = codePanelPath(root, family, stem);
			local = codePanelName(family, stem);
			writeGenerated(file, await codePanelModule({ family, stem, panes: panesOf(family, demo) }));
		}
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
	const registry = new DocRegistry(`pg-${family}-${stem}`);
	const colours = new ColourTable();
	const sourceLines = paneLines(await highlightHtml(displaySource(analysis, slots), 'tsrx'), registry, colours);
	const cssLines = analysis.css === '' ? [] : paneLines(await highlightHtml(analysis.css, 'css'), registry, colours);
	return playgroundModule({
		demo: analysis,
		meta,
		controls,
		slots,
		sourceLines,
		cssLines,
		docs: registry.docs,
		colourCss: colours.css(),
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
				const result = (await injectScenarioTags(expanded ?? code, id, root, watch)) ?? expanded;
				return result === undefined ? undefined : { code: result, map: null };
			},
		},
	};
}
