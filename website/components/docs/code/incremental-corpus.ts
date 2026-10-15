// The <Code> block corpus and the edit sequence the incremental-compile tests replay over it.
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { findCodeBlocks } from '../../../tooling/code-blocks.ts';
import type { CodeFile, CompileOutcome } from './protocol.ts';

// One build id for both sides: it is written into resolver modules, and a block keeps one for its whole life.
export const BUILD_ID = 'code-incremental';
// Not imported, so a test that mocks node:fs for the bundler still reads the real pages.
const { readdirSync, readFileSync } = process.getBuiltinModule('node:fs');
const pages = fileURLToPath(new URL('../../../pages', import.meta.url));

function mdxFiles(directory: string): string[] {
	return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
		const path = join(directory, entry.name);
		if (entry.isDirectory()) return mdxFiles(path);
		return entry.name.endsWith('.mdx') ? [path] : [];
	});
}

export type Block = { readonly name: string; readonly files: readonly CodeFile[] };

// Starter files as a page's block sends them: the entry first.
export const corpus: Block[] = mdxFiles(pages)
	.toSorted()
	.flatMap((file) =>
		findCodeBlocks(readFileSync(file, 'utf8'), file).map((block) => ({
			name: `${relative(pages, file)}:${block.startLine + 1}`,
			files: [
				...block.files.filter((code) => code.name === block.entry),
				...block.files.filter((code) => code.name !== block.entry),
			],
		})),
	);

// Element text: letters between a tag's `>` and a closing tag, with no markup or code in between.
const TEXT_NODE = />([^<>{}@;=]*[A-Za-z][^<>{}@;=]*)<\//;
// Element text that runs into a `{value}`, as in `Count {count}`.
const TEXT_BEFORE_VALUE = />(\s*[A-Za-z][^<>{}@;=]*?)\s*\{/;
const STRING_LITERAL = /^(?!\s*import\b).*?('[^'\n]*[A-Za-z][^'\n]*'|"[^"\n]*[A-Za-z][^"\n]*")/m;
// Where an element can go: after element text, before a `{name}` child, or inside a plain tag.
const ELEMENT_PLACES = [
	TEXT_NODE,
	TEXT_BEFORE_VALUE,
	/>()\s*\{[A-Za-z_][\w.]*\}/,
	/<[a-z][a-z0-9]*()>/,
];

export function editText(code: string): string | undefined {
	const text = TEXT_NODE.exec(code) ?? TEXT_BEFORE_VALUE.exec(code);
	if (text) {
		const at = text.index + 1 + text[1]!.trimEnd().length;
		return `${code.slice(0, at)} edited${code.slice(at)}`;
	}
	const literal = STRING_LITERAL.exec(code);
	if (literal) {
		const at = literal.index + literal[0].length - 1;
		return `${code.slice(0, at)} edited${code.slice(at)}`;
	}
	return undefined;
}

function editState(code: string): string | undefined {
	const match = /\bstate\(\s*(-?\d+(?:\.\d+)?|'[^'\n]*'|"[^"\n]*"|true|false)/.exec(code);
	if (!match) return undefined;
	const value = match[1]!;
	const next =
		value === 'true'
			? 'false'
			: value === 'false'
				? 'true'
				: /^['"]/.test(value)
					? `${value.slice(0, -1)}x${value.at(-1)}`
					: String(Number(value) + 7);
	const at = match.index + match[0].length - value.length;
	return `${code.slice(0, at)}${next}${code.slice(at + value.length)}`;
}

function addElement(code: string): string | undefined {
	for (const place of ELEMENT_PLACES) {
		const match = place.exec(code);
		if (!match) continue;
		const at =
			place === TEXT_NODE || place === TEXT_BEFORE_VALUE
				? match.index + 1 + match[1]!.trimEnd().length
				: match.index + match[0].indexOf('>') + 1;
		return `${code.slice(0, at)}<i>added</i>${code.slice(at)}`;
	}
	return undefined;
}

function editOther(file: CodeFile): string {
	if (file.name.endsWith('.css')) return `${file.code}\n.incremental-edit { color: red; }\n`;
	return editText(file.code) ?? `${file.code}\nexport const incrementalEdit = 1;\n`;
}

export type Step = { readonly name: string; readonly files: readonly CodeFile[] };

export function withFile(files: readonly CodeFile[], name: string, code: string): CodeFile[] {
	return files.map((file) => (file.name === name ? { name, code } : file));
}

/** Every edit the sequence makes to `block`, each applied on top of the one before. */
export function editSteps(block: Block): Step[] {
	const steps: Step[] = [{ name: 'starter', files: block.files }];
	const entry = block.files[0]!;
	let files = block.files;
	const push = (name: string, file: string, code: string | undefined) => {
		if (code === undefined) return;
		files = withFile(files, file, code);
		steps.push({ name, files });
	};
	const current = () => files.find((file) => file.name === entry.name)!.code;
	push('change a text literal', entry.name, editText(current()));
	push('change a state() initial value', entry.name, editState(current()));
	push('add an element', entry.name, addElement(current()));
	const other = block.files[1];
	if (other) push(`edit ${other.name}`, other.name, editOther(files[1]!));
	const good = files;
	push('introduce a syntax error', entry.name, `${current()}\nconst broken = ;\n`);
	files = good;
	steps.push({ name: 'fix the syntax error', files });
	steps.push({ name: 'revert to the starter', files: block.files });
	return steps;
}

/** The first difference between two outcomes, or undefined when they match field for field. */
export function firstDifference(incremental: CompileOutcome, cold: CompileOutcome): string | undefined {
	if (incremental.ok !== cold.ok) return `ok: incremental ${incremental.ok}, cold ${cold.ok}`;
	if (!incremental.ok || !cold.ok) {
		const a = JSON.stringify(!incremental.ok && incremental.diagnostics);
		const b = JSON.stringify(!cold.ok && cold.diagnostics);
		return a === b ? undefined : `diagnostics: incremental ${a}, cold ${b}`;
	}
	if (incremental.entry !== cold.entry) return `entry: ${incremental.entry} vs ${cold.entry}`;
	const ids = (outcome: typeof cold) => outcome.modules.map((module) => module.id);
	if (JSON.stringify(ids(incremental)) !== JSON.stringify(ids(cold)))
		return `module list: incremental ${JSON.stringify(ids(incremental))}, cold ${JSON.stringify(ids(cold))}`;
	for (const [index, module] of incremental.modules.entries()) {
		const other = cold.modules[index]!;
		for (const field of ['kind', 'code', 'imports'] as const)
			if (JSON.stringify(module[field]) !== JSON.stringify(other[field]))
				return `${module.id}: ${field} differs`;
	}
	return undefined;
}
