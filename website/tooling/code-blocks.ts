// `<Code>` around titled code fences in an .mdx page becomes one generated module per
// block: the starter files written beside it, so the site's own build renders the
// starter as the Result pane's first paint, and a `<Code>` the starter is projected into.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import type { Plugin } from 'vite';
import { editorText } from '../components/docs/code/editor.ts';
import { ColourTable, DocRegistry, highlightHtml, paneLines } from './ui-code-runs.ts';

export const CODE_GENERATED_DIR = 'components/docs/code/generated';
const CODE_COMPONENT = 'components/docs/code.tsrx';

// Attribute values may hold `>` (a note can show markup), so quoted and braced values are matched whole;
// a braced value may nest one level of braces, and strings inside it may hold any brace.
const STRING = String.raw`"[^"]*"|'[^']*'|\`[^\`]*\``;
const FLAT = String.raw`\{(?:[^{}"'\`]|${STRING})*\}`;
const BRACED = String.raw`\{(?:[^{}"'\`]|${STRING}|${FLAT})*\}`;
const OPEN = new RegExp(
	String.raw`^<Code((?:\s+[A-Za-z][\w-]*(?:=(?:"[^"]*"|'[^']*'|${BRACED}))?)*)\s*>$`,
);
const CLOSE = /^<\/Code>$/;
const FENCE = /^(`{3,})([\w-]*)(.*)$/;
const TITLE = /\btitle="([^"]+)"/;
const ENTRY = /(?:^|\s+)entry="([^"]*)"/;
const MODULE_NAME = 'block.tsrx';
const FILE_NAME = /^[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)*\.(tsrx|ts|css)$/;
const LANGUAGES: Readonly<Record<string, string>> = { tsrx: 'tsrx', ts: 'ts', css: 'css' };

export type CodeBlockFile = { readonly name: string; readonly code: string };

export type CodeBlock = {
	/** The `<Code ...>` attributes, passed on to the component as written. */
	readonly attributes: string;
	/** The `.tsrx` file the Result pane runs: `entry="..."` if given, else the first `.tsrx` fence. */
	readonly entry: string;
	readonly files: readonly CodeBlockFile[];
	/** 0-based lines of the block's `<Code>` and `</Code>` in the page. */
	readonly startLine: number;
	readonly endLine: number;
};

/** One run of highlighted code: shiki's colour pair as an inline style. */
export type CodeRun = { readonly id: string; readonly text: string; readonly style?: string };
export type CodeLine = { readonly id: string; readonly runs: readonly CodeRun[] };
export type CodePane = {
	readonly name: string;
	/** The file name before its extension, and the extension with its dot, for the tab label. */
	readonly stem: string;
	readonly ext: string;
	/** The tab's value: `FIRST_TAB` for the first pane, else the file name. */
	readonly tab: string;
	/** The file as its textarea holds it. */
	readonly code: string;
	readonly lines: readonly CodeLine[];
};

/** code.tsrx opens on this literal: tabs resume only from an arrival value the compiler can see. */
export const FIRST_TAB = 'first';

function fail(file: string, line: number, message: string): never {
	throw new Error(`code-blocks: ${file}:${line + 1}: ${message}`);
}

/** Every `<Code>` block of a page, its fences read as files. Throws on a malformed block. */
export function findCodeBlocks(source: string, file: string): CodeBlock[] {
	const lines = source.split('\n');
	const blocks: CodeBlock[] = [];
	let fence: string | undefined;
	for (let at = 0; at < lines.length; at++) {
		const line = lines[at]!.trim();
		if (fence) {
			if (line === fence) fence = undefined;
			continue;
		}
		const opensFence = FENCE.exec(line);
		if (opensFence) {
			fence = opensFence[1];
			continue;
		}
		const open = OPEN.exec(line);
		if (!open) continue;
		const files: CodeBlockFile[] = [];
		const startLine = at;
		let endLine = -1;
		for (at++; at < lines.length; at++) {
			const inner = lines[at]!.trim();
			if (CLOSE.test(inner)) {
				endLine = at;
				break;
			}
			if (inner === '') continue;
			const head = FENCE.exec(inner);
			if (!head) fail(file, at, 'only titled code fences may sit inside <Code>.');
			const title = TITLE.exec(head[3])?.[1];
			if (!title)
				fail(file, at, 'a fence inside <Code> needs title="name.tsrx" (or .ts, .css).');
			const kind = FILE_NAME.exec(title)?.[1];
			if (!kind)
				fail(file, at, `"${title}" is not a file name ending in .tsrx, .ts or .css.`);
			if (title === MODULE_NAME)
				fail(
					file,
					at,
					`"${MODULE_NAME}" is the name of the generated block module; pick another title.`,
				);
			if (files.some((existing) => existing.name === title))
				fail(file, at, `two fences inside <Code> are both titled "${title}".`);
			const body: string[] = [];
			const fenceAt = at;
			for (at++; at < lines.length && lines[at]!.trim() !== head[1]; at++)
				body.push(lines[at]!);
			if (at >= lines.length) fail(file, fenceAt, `the "${title}" fence is never closed.`);
			files.push({ name: title, code: `${body.join('\n')}\n` });
		}
		if (endLine < 0) fail(file, startLine, '<Code> is never closed with </Code>.');
		const tsrx = files.filter((entry) => entry.name.endsWith('.tsrx'));
		if (tsrx.length === 0) fail(file, startLine, '<Code> needs at least one .tsrx fence.');
		const written = open[1]?.trim() ?? '';
		const named = ENTRY.exec(written)?.[1];
		if (named !== undefined && !tsrx.some((entry) => entry.name === named))
			fail(file, startLine, `entry="${named}" names no .tsrx fence in this <Code>.`);
		const entry = named ?? tsrx[0]!.name;
		const attributes = written.replace(ENTRY, '').trim();
		blocks.push({ attributes, entry, files, startLine, endLine });
	}
	return blocks;
}

/** The highlighted lines of one file, drawn under the textarea that holds its text. */
export async function codePane(file: CodeBlockFile, index = 0): Promise<CodePane> {
	const language = LANGUAGES[file.name.slice(file.name.lastIndexOf('.') + 1)] ?? 'ts';
	const code = editorText(file.code);
	const html = await highlightHtml(code, language);
	// The colour table hands back the style itself, so each run keeps shiki's light/dark pair.
	const styles = { classFor: (style: string) => style || undefined } as unknown as ColourTable;
	const lines = paneLines(html, new DocRegistry('code'), styles);
	const dot = file.name.lastIndexOf('.');
	return {
		name: file.name,
		stem: dot > 0 ? file.name.slice(0, dot) : file.name,
		ext: dot > 0 ? file.name.slice(dot) : '',
		tab: index === 0 ? FIRST_TAB : file.name,
		code,
		lines: lines.map((line) => ({
			id: line.id,
			runs: line.runs.map((run) => {
				const style = run.class?.replace(/^tsrx-hover ?/, '');
				return style
					? { id: run.id, text: run.text, style }
					: { id: run.id, text: run.text };
			}),
		})),
	};
}

function pageSlug(file: string): string {
	const at = file.lastIndexOf('/pages/');
	const route = at < 0 ? file : file.slice(at + '/pages/'.length);
	return route
		.replace(/\.mdx$/, '')
		.replace(/[^A-Za-z0-9]+/g, '-')
		.replace(/^-|-$/g, '');
}

function specifier(fromFile: string, toFile: string): string {
	const path = relative(dirname(fromFile), toFile);
	return path.startsWith('.') ? path : `./${path}`;
}

/** The generated module for one block: `<Code>` with the starter projected in as its first result. */
export function codeBlockModule(input: {
	readonly block: CodeBlock;
	readonly panes: readonly CodePane[];
	readonly moduleFile: string;
	readonly componentFile: string;
	readonly page: string;
}): string {
	const { block, panes, moduleFile, componentFile, page } = input;
	// The engine runs the first .tsrx in `files`; the tabs keep the page's order.
	const ordered = [
		...block.files.filter((file) => file.name === block.entry),
		...block.files.filter((file) => file.name !== block.entry),
	];
	const files = ordered.map(({ name, code }) => ({ name, code }));
	const attributes = block.attributes ? ` ${block.attributes}` : '';
	return `// Written by tooling/code-blocks.ts from ${page}. Edit the page, not this file.
import Code from ${JSON.stringify(specifier(moduleFile, componentFile))};
import Starter from ${JSON.stringify(`./${block.entry}`)};

const files = ${JSON.stringify(files)};

const panes = ${JSON.stringify(panes)};

export default function CodeBlock() @{
	<Code files={files} panes={panes}${attributes}>
		<Starter />
	</Code>
}
`;
}

/** Writes a generated file only when its text changed, so a concurrent load never reads it half-written. */
function writeGenerated(file: string, text: string): void {
	try {
		if (readFileSync(file, 'utf8') === text) return;
	} catch {}
	mkdirSync(dirname(file), { recursive: true });
	writeFileSync(file, text);
}

/** Rewrites a page's `<Code>` blocks into imports of generated modules; `write` receives each file. */
export async function rewriteCodeBlocks(
	source: string,
	file: string,
	root: string,
	write: (path: string, text: string) => void = writeGenerated,
): Promise<string | undefined> {
	const blocks = findCodeBlocks(source, file);
	if (blocks.length === 0) return undefined;
	const lines = source.split('\n');
	const imports: string[] = [];
	const slug = pageSlug(file);
	const componentFile = join(root, CODE_COMPONENT);
	const page = relative(root, file);
	for (const [index, block] of blocks.entries()) {
		const dir = join(root, CODE_GENERATED_DIR, `${slug}-${index + 1}`);
		const moduleFile = join(dir, MODULE_NAME);
		for (const starter of block.files) write(join(dir, starter.name), starter.code);
		const panes = await Promise.all(block.files.map((file, index) => codePane(file, index)));
		write(moduleFile, codeBlockModule({ block, panes, moduleFile, componentFile, page }));
		const local = `CodeBlock${index + 1}`;
		imports.push(`import ${local} from ${JSON.stringify(specifier(file, moduleFile))};`);
		lines.splice(
			block.startLine,
			block.endLine - block.startLine + 1,
			`<${local} />`,
			...Array.from({ length: block.endLine - block.startLine }, () => ''),
		);
	}
	const body = lines.join('\n').replace(/^import\s+Code\s+from\s+['"][^'"]+['"];?[ \t]*\n/m, '');
	// The blank line matters: MDX reads an import touching the next line as prose.
	return `${imports.join('\n')}\n\n${body}`;
}

export function codeBlocks(): Plugin {
	let root = process.cwd();
	return {
		name: 'compiled-website:code-blocks',
		enforce: 'pre',
		configResolved(config) {
			root = config.root;
		},
		transform: {
			order: 'pre',
			async handler(code: string, id: string) {
				const file = id.split('?', 1)[0] ?? id;
				if (!file.endsWith('.mdx') || !code.includes('<Code')) return;
				const next = await rewriteCodeBlocks(code, file, root);
				return next === undefined ? undefined : { code: next, map: null };
			},
		},
	};
}
