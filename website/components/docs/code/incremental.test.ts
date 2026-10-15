import { mkdtempSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { compileFiles, createBlockCompiler } from './compile.ts';
import {
	BUILD_ID,
	corpus,
	editSteps,
	editText,
	firstDifference,
	withFile,
} from './incremental-corpus.ts';
import { nodeSourceHost } from './node-sources.ts';

// On disk, so the bundler's own file reads see the block's files as they do in the compile worker.
const folder = join(realpathSync(mkdtempSync(join(tmpdir(), 'markless-code-'))), 'code');

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

	it('rebuilds a file whose transform failed when the next edit is to another file', async () => {
		const card = (child: string) => `import Badge from './badge.tsrx';

export default function Card() @{
	<section>${child}</section>
}
`;
		const badge = (close: string) =>
			`export default function Badge({ value }: { value: number }) @{\n\t<strong>{value}${close}\n}\n`;
		const steps = [
			[card('<Badge value={1} />'), badge('</strong>')],
			[card('<Badge value={1} />'), badge('</strong')],
			[card('<p>none</p>'), badge('</strong')],
			[card('<Badge value={1} />'), badge('</strong')],
			[card('<Badge value={1} />'), badge('</strong>')],
		] as const;
		const compiler = createBlockCompiler(nodeSourceHost(folder), BUILD_ID);
		const mismatches: string[] = [];
		for (const [index, [entry, child]] of steps.entries()) {
			const files = [
				{ name: 'card.tsrx', code: entry },
				{ name: 'badge.tsrx', code: child },
			];
			const incremental = await compiler.compile(files);
			const difference = firstDifference(
				incremental,
				await compileFiles(files, BUILD_ID, nodeSourceHost(folder)),
			);
			if (difference) mismatches.push(`step ${index}: ${difference}`);
			expect(incremental.ok, `step ${index}`).toBe(index === 0 || index === 4);
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
