import {
	cpSync,
	mkdirSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import {
	applyChanges,
	diffAnchors,
	fold,
	readAnchorsWithChanges,
	readChangeFiles,
	recordChange,
	SURFACES,
} from './anchor-ledger.mjs';

type Load = { executedChars: number; jsGzipBytes: number };
type Anchors = {
	loadWeight: Record<string, Record<string, Load>>;
	runtimeModules: Record<string, number>;
	history: unknown[];
};

const scratch: string[] = [];
afterEach(() => {
	for (const dir of scratch.splice(0)) rmSync(dir, { recursive: true, force: true });
});

/** A checkout of main: its anchor file and its change directory. */
function checkout(from?: string) {
	const root = mkdtempSync(join(tmpdir(), 'anchor-ledger-'));
	scratch.push(root);
	if (from) cpSync(from, root, { recursive: true });
	else {
		const anchors: Anchors = {
			loadWeight: {
				'linux-x64': { 'bench /': { executedChars: 11_371, jsGzipBytes: 89_152 } },
			},
			runtimeModules: { 'web/resume': 3_179 },
			history: [],
		};
		writeFileSync(join(root, 'anchors.json'), JSON.stringify(anchors));
	}
	const basePath = join(root, 'anchors.json');
	const dir = join(root, 'changes');
	const read = (exclude?: string) =>
		readAnchorsWithChanges('perf-guards', {
			dir,
			exclude,
			base: JSON.parse(readFileSync(basePath, 'utf8')),
		}) as Anchors;
	return { root, basePath, dir, read };
}

/** What accept does with a measured page weight: anchors that page to the measurement. */
const measuredLoad = (load: Load) => (anchors: Anchors) => {
	const next = structuredClone(anchors);
	next.loadWeight['linux-x64']!['bench /'] = load;
	return next;
};

function mergeInto(
	main: ReturnType<typeof checkout>,
	branch: ReturnType<typeof checkout>,
	name: string,
) {
	mkdirSync(main.dir, { recursive: true });
	cpSync(join(branch.dir, `${name}.json`), join(main.dir, `${name}.json`));
}

describe('anchor change ledger', () => {
	test('every committed change file applies to its anchor file', () => {
		for (const surface of Object.keys(SURFACES))
			expect(() => readAnchorsWithChanges(surface)).not.toThrow();
	});

	test('two pull requests that both move the same page weight merge in either order with no new measurement', () => {
		const main = checkout();
		const prA = checkout(main.root);
		const prB = checkout(main.root);
		// Each branch measures its own tree on main and records only its own difference.
		recordChange('perf-guards', measuredLoad({ executedChars: 11_371, jsGzipBytes: 89_170 }), {
			name: 'fix-same-page-link',
			dir: prA.dir,
			basePath: prA.basePath,
			reason: 'an early return in the link handler, none of it executed at load',
			date: '2026-11-03',
		});
		recordChange('perf-guards', measuredLoad({ executedChars: 11_400, jsGzipBytes: 89_159 }), {
			name: 'fix-try-row-click',
			dir: prB.dir,
			basePath: prB.basePath,
			reason: 'a click on rows a @try just painted is never lost',
			date: '2026-11-03',
		});
		expect(readChangeFiles(prA.dir)[0]!.changes).toEqual([
			expect.objectContaining({
				path: ['loadWeight', 'linux-x64', 'bench /', 'jsGzipBytes'],
				delta: 18,
			}),
		]);
		expect(
			readChangeFiles(prB.dir)[0]!.changes.map((entry) => 'delta' in entry && entry.delta),
		).toEqual([29, 7]);

		// A merges first; B's tree on top of it is checked against both recorded changes.
		mergeInto(main, prA, 'fix-same-page-link');
		const afterA = main.read();
		expect(afterA.loadWeight['linux-x64']!['bench /']).toEqual({
			executedChars: 11_371,
			jsGzipBytes: 89_170,
		});
		mergeInto(main, prB, 'fix-try-row-click');
		expect(main.read().loadWeight['linux-x64']!['bench /']).toEqual({
			executedChars: 11_400,
			jsGzipBytes: 89_177,
		});
		expect(readdirSync(main.dir).sort()).toEqual([
			'fix-same-page-link.json',
			'fix-try-row-click.json',
		]);
	});

	test('accepting again after a rebase replaces the branch entries with the new measurement', () => {
		const main = checkout();
		const prA = checkout(main.root);
		recordChange('perf-guards', measuredLoad({ executedChars: 11_371, jsGzipBytes: 89_170 }), {
			name: 'a',
			dir: prA.dir,
			basePath: prA.basePath,
			reason: 'a',
		});
		const prB = checkout(main.root);
		recordChange('perf-guards', measuredLoad({ executedChars: 11_371, jsGzipBytes: 89_159 }), {
			name: 'b',
			dir: prB.dir,
			basePath: prB.basePath,
			reason: 'b',
		});
		mergeInto(main, prA, 'a');
		// gzip of the tree with both measured 2 B over the sum of their changes, so B accepts once more.
		mergeInto(prB, main, 'a');
		recordChange('perf-guards', measuredLoad({ executedChars: 11_371, jsGzipBytes: 89_179 }), {
			name: 'b',
			dir: prB.dir,
			basePath: prB.basePath,
			reason: 'b, measured on a tree with a',
		});
		expect(readChangeFiles(prB.dir).find((file) => file.name === 'b')!.changes).toEqual([
			expect.objectContaining({ delta: 9, reason: 'b, measured on a tree with a' }),
		]);
		expect(prB.read().loadWeight['linux-x64']!['bench /'].jsGzipBytes).toBe(89_179);
	});

	test('a win is recorded as a negative change in the same change set', () => {
		const pr = checkout();
		recordChange('perf-guards', measuredLoad({ executedChars: 10_000, jsGzipBytes: 88_000 }), {
			name: 'win',
			dir: pr.dir,
			basePath: pr.basePath,
			reason: 'the router no longer ships its idle loader at load',
		});
		expect(
			readChangeFiles(pr.dir)[0]!.changes.map((entry) => 'delta' in entry && entry.delta),
		).toEqual([-1_371, -1_152]);
	});

	test('two pull requests adding the same new anchor fail loudly and name both', () => {
		const base = { runtimeModules: {} };
		const add = (name: string, bytes: number) => ({
			name,
			changes: [
				{
					surface: 'perf-guards',
					path: ['runtimeModules', 'web/new'],
					set: bytes,
					reason: name,
				},
			],
		});
		expect(() => applyChanges(base, [add('one', 10), add('two', 12)], 'perf-guards')).toThrow(
			/changed by both one and two/,
		);
	});

	test('a change to an anchor that does not exist fails', () => {
		expect(() =>
			applyChanges(
				{ runtimeModules: {} },
				[
					{
						name: 'x',
						changes: [
							{
								surface: 'perf-guards',
								path: ['runtimeModules', 'gone'],
								delta: 4,
								reason: 'x',
							},
						],
					},
				],
				'perf-guards',
			),
		).toThrow(/does not exist/);
	});

	test('a change without a reason is rejected', () => {
		const pr = checkout();
		expect(() =>
			recordChange('perf-guards', (anchors) => anchors, {
				name: 'x',
				dir: pr.dir,
				basePath: pr.basePath,
				reason: ' ',
			}),
		).toThrow(/reason/);
	});

	test('diff records numbers as deltas, new anchors as set, vanished ones as remove, and list growth as append', () => {
		expect(
			diffAnchors(
				{ a: 1, b: { c: 2 }, gone: 3, list: ['x'], history: [1] },
				{ a: 4, b: { c: 2, d: 5 }, list: ['x', 'y'], history: [1, 2] },
			),
		).toEqual([
			{ path: ['a'], delta: 3 },
			{ path: ['b', 'd'], set: 5 },
			{ path: ['gone'], remove: true },
			{ path: ['list'], append: ['y'] },
		]);
	});

	test('fold writes the changes into the anchor file without moving any limit', () => {
		const main = checkout();
		const branches = (
			[
				['a', { executedChars: 11_371, jsGzipBytes: 89_170 }],
				['b', { executedChars: 11_371, jsGzipBytes: 89_150 }],
			] as const
		).map(([name, load]) => {
			const pr = checkout(main.root);
			recordChange('perf-guards', measuredLoad(load), {
				name,
				dir: pr.dir,
				basePath: pr.basePath,
				reason: name,
			});
			return [name, pr] as const;
		});
		for (const [name, pr] of branches) mergeInto(main, pr, name);
		const before = main.read();
		fold({
			dir: main.dir,
			surfaces: { 'perf-guards': { ...SURFACES['perf-guards']!, path: main.basePath } },
			date: '2026-11-03',
		});
		expect(readdirSync(main.dir)).toEqual([]);
		const after = JSON.parse(readFileSync(main.basePath, 'utf8')) as Anchors;
		expect({ ...after, history: [] }).toEqual({ ...before, history: [] });
		expect(after.history).toEqual([
			{
				date: '2026-11-03',
				guard: 'load',
				subject: 'bench / (linux-x64)',
				from: { executedChars: 11_371, jsGzipBytes: 89_152 },
				to: { executedChars: 11_371, jsGzipBytes: 89_168 },
				reason: 'a: a; b: b',
			},
		]);
	});
});
