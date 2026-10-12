import { mkdtempSync, readdirSync, readFileSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { findCodeBlocks } from '../../../tooling/code-blocks.ts';
import { compileFiles, createBlockCompiler } from './compile.ts';
import { nodeSourceHost } from './node-sources.ts';
import type { CodeFile, CompileOutcome } from './protocol.ts';

const pages = fileURLToPath(new URL('../../../pages', import.meta.url));
// One build id for both sides: it is written into resolver modules, and a block keeps one for its whole life.
const BUILD_ID = 'code-incremental';
// On disk, so the bundler's own file reads see the block's files as they do in the compile worker.
const folder = join(realpathSync(mkdtempSync(join(tmpdir(), 'markless-code-'))), 'code');

function mdxFiles(directory: string): string[] {
	return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
		const path = join(directory, entry.name);
		if (entry.isDirectory()) return mdxFiles(path);
		return entry.name.endsWith('.mdx') ? [path] : [];
	});
}

type Block = { readonly name: string; readonly files: readonly CodeFile[] };

// Starter files as a page's block sends them: the entry first.
const corpus: Block[] = mdxFiles(pages)
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

function editText(code: string): string | undefined {
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

type Step = { readonly name: string; readonly files: readonly CodeFile[] };

function withFile(files: readonly CodeFile[], name: string, code: string): CodeFile[] {
	return files.map((file) => (file.name === name ? { name, code } : file));
}

/** Every edit the sequence makes to `block`, each applied on top of the one before. */
function editSteps(block: Block): Step[] {
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
function firstDifference(incremental: CompileOutcome, cold: CompileOutcome): string | undefined {
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

describe('incremental compiles', () => {
	it('covers every <Code> block on the site', () => {
		expect(corpus.length).toBeGreaterThan(20);
		expect(corpus.filter((block) => block.files.length > 1).length).toBeGreaterThan(0);
		for (const block of corpus)
			expect(editSteps(block).length, `${block.name} gets no edit`).toBeGreaterThan(4);
	});

	it.each(corpus.map((block) => [block.name, block] as const))(
		'%s builds what a cold build builds after every edit',
		async (_name, block) => {
			const compiler = createBlockCompiler(nodeSourceHost(folder), BUILD_ID);
			const mismatches: string[] = [];
			const steps = editSteps(block);
			for (const step of steps) {
				const incremental = await compiler.compile(step.files);
				const cold = await compileFiles(step.files, BUILD_ID, nodeSourceHost(folder));
				const difference = firstDifference(incremental, cold);
				if (difference)
					mismatches.push(`${block.name} after "${step.name}": ${difference}`);
				if (step.name === 'introduce a syntax error') expect(incremental.ok).toBe(false);
				else expect(cold.ok, JSON.stringify(!cold.ok && cold.diagnostics)).toBe(true);
			}
			expect(mismatches).toEqual([]);
		},
		120_000,
	);

	it('rebuilds what a parent links from a child or constant it imports', async () => {
		const card = `import { state } from '@markless/core';
import Badge from './badge.tsrx';
import { label } from './label.ts';

export default function Card() @{
	let n = state(1);
	<section>
		<Badge value={n} title={label} />
		<button onClick={() => n++}>Add</button>
	</section>
}
`;
		const props = '{ value, title }: { value: number; title: string }';
		const badges = [
			`export default function Badge(${props}) @{\n\t<strong>{title}{value}</strong>\n}\n`,
			`import { state } from '@markless/core';\n\nexport default function Badge(${props}) @{\n\tlet open = state(false);\n\t<strong onClick={() => (open = !open)}>{title}{value}</strong>\n}\n`,
			`export default function Badge({ value }: { value: number }) @{\n\t<strong>{value}</strong>\n}\n`,
		];
		const steps = [
			[badges[0]!, 'A'],
			[badges[0]!, 'B'],
			[badges[1]!, 'B'],
			[badges[2]!, 'B'],
			[badges[0]!, 'A'],
		] as const;
		const compiler = createBlockCompiler(nodeSourceHost(folder), BUILD_ID);
		const mismatches: string[] = [];
		for (const [index, [badge, label]] of steps.entries()) {
			const files = [
				{ name: 'card.tsrx', code: card },
				{ name: 'badge.tsrx', code: badge },
				{ name: 'label.ts', code: `export const label = '${label}';\n` },
			];
			const incremental = await compiler.compile(files);
			const difference = firstDifference(
				incremental,
				await compileFiles(files, BUILD_ID, nodeSourceHost(folder)),
			);
			if (difference) mismatches.push(`step ${index}: ${difference}`);
			if (index > 0) expect(compiler.lastBuild.transformed).toContain(`${folder}/card.tsrx`);
		}
		expect(mismatches).toEqual([]);
	}, 120_000);

	it('transforms only the edited file and what Markless invalidation names', async () => {
		const reaches = corpus.filter((block) =>
			block.files.some((file) => file.code.includes('@markless/ui')),
		);
		expect(reaches.length).toBeGreaterThan(0);
		for (const block of reaches) {
			const compiler = createBlockCompiler(nodeSourceHost(folder), BUILD_ID);
			const starter = await compiler.compile(block.files);
			expect(starter.ok).toBe(true);
			const cold = compiler.lastBuild.transformed.length;
			const entry = block.files[0]!;
			const edited = editText(entry.code);
			expect(edited).toBeDefined();
			const outcome = await compiler.compile(withFile(block.files, entry.name, edited!));
			expect(outcome.ok).toBe(true);
			const { transformed, invalidated } = compiler.lastBuild;
			const path = `${folder}/${entry.name}`;
			const named = new Set(
				invalidated.map((id) => (id.startsWith('\0') ? id.slice(1) : id)),
			);
			const unexpected = transformed.filter((id) => {
				const key = id.startsWith('\0') ? id.slice(1) : id;
				return key.split('?')[0] !== path && !named.has(key);
			});
			expect(unexpected, block.name).toEqual([]);
			expect(transformed.length, block.name).toBeGreaterThan(0);
			expect(transformed.length, block.name).toBeLessThan(cold);
		}
	}, 120_000);
});
