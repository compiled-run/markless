import { describe, expect, it, vi } from 'vitest';
import { compileFiles, createBlockCompiler } from './compile.ts';
import { BUILD_ID, corpus, editSteps, firstDifference } from './incremental-corpus.ts';
import type { SourceHost } from './bundle-host.ts';
import type { CompileOutcome } from './protocol.ts';
import {
	addSourceFile,
	hasSourceContents,
	readFileSync,
	removeSourceFile,
	takeSourceMisses,
} from './source-fs.ts';
import { sourceFiles, workerSourceHost } from './worker-sources.ts';

// The bundler reads files the way it does in the compile worker, where package source arrives lazily.
vi.mock('node:fs', () => import('./source-fs.ts'));
vi.mock('node:fs/promises', () => import('./source-fs.ts'));

const BLOCK = 'lazy';
const PACKAGES = '/packages/';
const REPO_PACKAGES = new URL('../../../../packages/', import.meta.url);
// The worker's `?raw` loaders do not yield text under Vitest, so contents come from disk.
const { readFile } = process.getBuiltinModule('node:fs/promises');
const declared = new Set(sourceFiles());

async function read(path: string): Promise<string | undefined> {
	if (hasSourceContents(path)) return readFileSync(path);
	if (!declared.has(path)) return undefined;
	const code = await readFile(new URL(path.slice(PACKAGES.length), REPO_PACKAGES), 'utf8');
	addSourceFile(path, code);
	return code;
}

/** The compile worker's host, its package source read from disk on first use. */
function lazyHost(misses: string[]): SourceHost {
	return {
		...workerSourceHost(BLOCK),
		read,
		async takeMisses() {
			const taken = takeSourceMisses();
			await Promise.all(taken.map(read));
			misses.push(...taken);
			return taken;
		},
	};
}

async function loadAll(): Promise<void> {
	await Promise.all([...declared].map(read));
}

function unloadAll(): void {
	for (const path of declared) {
		removeSourceFile(path);
		addSourceFile(path);
	}
}

describe('incremental compiles that read package source lazily', () => {
	it('starts from package source that is declared but not loaded', () => {
		expect(declared.size).toBeGreaterThan(20);
		unloadAll();
		expect([...declared].filter(hasSourceContents)).toEqual([]);
	});

	it.each(corpus.map((block) => [block.name, block] as const))(
		'%s builds what a cold build over loaded source builds after every edit',
		async (_name, block) => {
			const steps = editSteps(block);
			await loadAll();
			const cold: CompileOutcome[] = [];
			const coldMisses: string[] = [];
			for (const step of steps)
				cold.push(await compileFiles(step.files, BUILD_ID, lazyHost(coldMisses)));
			expect(coldMisses).toEqual([]);

			unloadAll();
			const misses: string[] = [];
			const compiler = createBlockCompiler(lazyHost(misses), BUILD_ID);
			const mismatches: string[] = [];
			for (const [index, step] of steps.entries()) {
				const incremental = await compiler.compile(step.files);
				const difference = firstDifference(incremental, cold[index]!);
				if (difference)
					mismatches.push(`${block.name} after "${step.name}": ${difference}`);
				const coldOutcome = cold[index]!;
				if (step.name === 'introduce a syntax error') expect(incremental.ok).toBe(false);
				else
					expect(
						coldOutcome.ok,
						JSON.stringify(!coldOutcome.ok && coldOutcome.diagnostics),
					).toBe(true);
			}
			expect(mismatches).toEqual([]);
			if (block.files.some((file) => file.code.includes('@markless/ui')))
				expect(misses.length, 'a block reaching package source misses a read').toBeGreaterThan(0);
		},
		120_000,
	);
});
