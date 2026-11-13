import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import {
	buildBaseline,
	chooseReference,
	ledgerHistory,
	rebaseLoadAnchors,
} from './baseline.mjs';
import { BUDGETS } from './config.mjs';
import { evaluate } from './evaluate.mjs';

const PLATFORM = 'linux-x64';
const PAGE = 'docs /';
const ALLOWED = BUDGETS.loadDownloadCompositionBytes;

type Load = { executedChars: number; jsGzipBytes: number };
type Commit = { sha: string; anchor: number; marked: boolean; measured?: number };

const measurement = (jsGzipBytes: number, executedChars = 25_000) => ({
	platform: PLATFORM,
	sites: {
		docs: {
			routes: {
				'/': {
					load: { executedChars, jsGzipBytes, files: [] },
					preload: {
						missingFiles: [],
						rounds: 1,
						chain: [],
						notPreloaded: [],
						gzipBytes: 0,
						files: [],
					},
					controls: [],
				},
			},
		},
	},
});

const anchorsWith = (load: Load) => ({ loadWeight: { [PLATFORM]: { [PAGE]: load } } });

/**
 * G16's download verdict for a tree whose own ledger holds `headAnchor` (and adds a change entry for the page when
 * `headMarked`), measured at `headBytes`, on top of `chain` (its base first).
 */
function verdict(headAnchor: number, headMarked: boolean, headBytes: number, chain: Commit[]) {
	const history = {
		head: {
			sha: 'head',
			load: anchorsWith({ executedChars: 25_000, jsGzipBytes: headAnchor }).loadWeight,
			marked: new Set(headMarked ? [`${PLATFORM} ${PAGE}`] : []),
		},
		chain: chain.map((commit) => ({
			sha: commit.sha,
			load: anchorsWith({ executedChars: 25_000, jsGzipBytes: commit.anchor }).loadWeight,
			marked: new Set(commit.marked ? [`${PLATFORM} ${PAGE}`] : []),
		})),
	};
	const baseline = buildBaseline({
		history,
		platform: PLATFORM,
		measurementAt: (i: number) =>
			chain[i].measured === undefined
				? undefined
				: { ...measurement(chain[i].measured!), run: 1 },
	});
	const anchors = rebaseLoadAnchors(
		anchorsWith({ executedChars: 25_000, jsGzipBytes: headAnchor }),
		baseline,
	);
	const { failures } = evaluate(measurement(headBytes), anchors);
	return { baseline, failures: failures.filter((finding) => finding.guard === 'G16') };
}

describe('chooseReference', () => {
	const chain = [
		{ sha: 'p0', value: 110, marked: false },
		{ sha: 'p1', value: 110, marked: true },
		{ sha: 'p2', value: 100, marked: false },
	];

	test('a page is judged against the last commit that recorded a change to its download', () => {
		expect(chooseReference({ headValue: 160 }, chain, () => true)).toEqual({ index: 1 });
		expect(chooseReference({ headValue: 110 }, chain, () => true)).toEqual({ index: 1 });
	});

	test('an unmeasured reference is not crossed: the page keeps the anchor rule', () => {
		expect(chooseReference({ headValue: 110 }, chain, (i) => i === 2)).toHaveProperty(
			'fallback',
		);
	});

	test('with no change entry in reach, the page keeps its anchor', () => {
		const pick = chooseReference(
			{ headValue: 100 },
			[{ sha: 'p0', value: 100, marked: false }],
			() => true,
		);
		expect(pick).toHaveProperty('fallback');
	});
});

describe('G16 downloads against a CI baseline', () => {
	// main: the anchor reads 1000 and CI measured 940 there, so the anchor has 60 B of room nobody recorded.
	const landedA = { sha: 'a', anchor: 1100, marked: true, measured: 1052 };
	const main = { sha: 'm', anchor: 1000, marked: true, measured: 940 };

	test('accepted changes stacked in the queue compose without an eject', () => {
		// A recorded +100 and measured +112 on main; B recorded +50 on its own merge-base and composes to +80 on A.
		const { failures } = verdict(1150, true, 1052 + 80, [landedA, main]);
		expect(failures).toEqual([]);
	});

	test('the second of two accepted changes is not ejected for the first one’s composition', () => {
		// main measures its anchor exactly; A records +100 and composes to +130, B records +50 and composes to +70.
		const exactMain = { sha: 'm', anchor: 1000, marked: true, measured: 1000 };
		const composedA = { sha: 'a', anchor: 1100, marked: true, measured: 1130 };
		const head = 1130 + 70;
		const absolute = evaluate(
			measurement(head),
			anchorsWith({ executedChars: 25_000, jsGzipBytes: 1150 }),
		).failures.filter((finding) => finding.guard === 'G16');
		expect(absolute).toHaveLength(1);
		expect(verdict(1150, true, head, [composedA, exactMain]).failures).toEqual([]);
	});

	test('a page that grows with no anchor change fails, room in the anchor or not', () => {
		const { failures } = verdict(1100, false, 1052 + 60, [
			{ ...landedA, marked: true },
			main,
		]);
		expect(failures.map((finding) => finding.message).join('\n')).toMatch(
			/downloads \+60 B gzip more than 1052 B measured on a/,
		);
	});

	test('a recorded change smaller than the real one fails', () => {
		// B recorded +50 and grew +110.
		const { failures } = verdict(1150, true, 1052 + 110, [landedA, main]);
		expect(failures).toHaveLength(1);
	});

	test('two changes each hiding growth under the allowance fail once together over it', () => {
		const first = verdict(1100, false, 1052 + 30, [landedA, main]);
		expect(first.failures).toEqual([]);
		const hiderA = { sha: 'h', anchor: 1100, marked: false, measured: 1052 + 30 };
		const second = verdict(1100, false, 1052 + 30 + 30, [hiderA, landedA, main]);
		expect(second.baseline.subjects[PAGE].commit).toBe('a');
		expect(second.failures).toHaveLength(1);
	});

	test('a recorded change does not get its own allowance on top of growth hidden ahead of it', () => {
		// H hid +30 since A; B records +50 and grows +50 +20: 50 B unrecorded since A in all.
		const hiderA = { sha: 'h', anchor: 1100, marked: false, measured: 1052 + 30 };
		const { baseline, failures } = verdict(1150, true, 1052 + 30 + 70, [hiderA, landedA, main]);
		expect(baseline.subjects[PAGE].commit).toBe('a');
		expect(failures).toHaveLength(1);
	});

	test('growth within the allowance since the last recorded change passes', () => {
		const { failures } = verdict(1100, false, 1052 + ALLOWED, [landedA, main]);
		expect(failures).toEqual([]);
	});

	test('executed characters stay on the anchor, whatever the baseline', () => {
		const history = {
			head: {
				sha: 'head',
				load: anchorsWith({ executedChars: 25_000, jsGzipBytes: 1100 }).loadWeight,
				marked: new Set<string>(),
			},
			chain: [
				{
					sha: 'a',
					load: anchorsWith({ executedChars: 25_000, jsGzipBytes: 1100 }).loadWeight,
					marked: new Set([`${PLATFORM} ${PAGE}`]),
				},
			],
		};
		const baseline = buildBaseline({
			history,
			platform: PLATFORM,
			measurementAt: () => ({ ...measurement(1052, 20_000), run: 1 }),
		});
		const anchors = rebaseLoadAnchors(
			anchorsWith({ executedChars: 25_000, jsGzipBytes: 1100 }),
			baseline,
		) as { loadWeight: Record<string, Record<string, Load>> };
		expect(anchors.loadWeight[PLATFORM][PAGE].executedChars).toBe(25_000);
		expect(anchors.loadWeight[PLATFORM][PAGE].jsGzipBytes).toBe(1052);
	});
});

describe('when the reference measurement is out of reach', () => {
	// The reference A drifted 80 B above its anchor; an older commit O drifted 70 B above its own.
	const older = { sha: 'o', anchor: 1000, marked: true, measured: 1070 };
	const reference = { sha: 'a', anchor: 1100, marked: true };
	const absolute = (headAnchor: number, headBytes: number) =>
		evaluate(
			measurement(headBytes),
			anchorsWith({ executedChars: 25_000, jsGzipBytes: headAnchor }),
		).failures.filter((finding) => finding.guard === 'G16');

	for (const [name, measurementAt] of [
		['unmeasured', () => undefined],
		[
			'the lookup throws',
			() => {
				throw new Error('gh: HTTP 403: API rate limit exceeded');
			},
		],
	] as const)
		test(`${name}: the page is judged by the anchor rule exactly, never a looser one`, () => {
			const history = {
				head: {
					sha: 'head',
					load: anchorsWith({ executedChars: 25_000, jsGzipBytes: 1100 }).loadWeight,
					marked: new Set<string>(),
				},
				chain: [reference, older].map((commit) => ({
					sha: commit.sha,
					load: anchorsWith({ executedChars: 25_000, jsGzipBytes: commit.anchor })
						.loadWeight,
					marked: new Set([`${PLATFORM} ${PAGE}`]),
				})),
			};
			const baseline = buildBaseline({
				history,
				platform: PLATFORM,
				measurementAt: (i: number) =>
					i === 1 ? { ...measurement(older.measured), run: 1 } : measurementAt(),
			});
			expect(baseline.subjects).toEqual({});
			expect(baseline.fallbacks[PAGE]).toMatch(/measurement of a, its last recorded change/);
			const anchors = anchorsWith({ executedChars: 25_000, jsGzipBytes: 1100 });
			expect(rebaseLoadAnchors(anchors, baseline)).toEqual(anchors);
			// Crossing to O would allow 1070 + 100 + 48; the anchor rule allows 1100 + 48.
			for (const bytes of [1100 + ALLOWED, 1100 + ALLOWED + 1, 1170 + ALLOWED]) {
				const { failures } = evaluate(measurement(bytes), rebaseLoadAnchors(anchors, baseline));
				expect(failures.filter((finding) => finding.guard === 'G16')).toEqual(
					absolute(1100, bytes),
				);
			}
		});
});

describe('ledgerHistory', () => {
	const roots: string[] = [];
	afterEach(() => {
		for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
	});

	// A git hook exports GIT_DIR and GIT_INDEX_FILE, which would point fixture commands at the real repository.
	const fixtureEnv = () => {
		const env: NodeJS.ProcessEnv = {
			...process.env,
			GIT_AUTHOR_NAME: 'fixture',
			GIT_AUTHOR_EMAIL: 'fixture@example.invalid',
			GIT_COMMITTER_NAME: 'fixture',
			GIT_COMMITTER_EMAIL: 'fixture@example.invalid',
			GIT_CONFIG_GLOBAL: '/dev/null',
			GIT_CONFIG_NOSYSTEM: '1',
		};
		for (const key of [
			'GIT_DIR',
			'GIT_WORK_TREE',
			'GIT_INDEX_FILE',
			'GIT_COMMON_DIR',
			'GIT_OBJECT_DIRECTORY',
			'GIT_ALTERNATE_OBJECT_DIRECTORIES',
			'GIT_PREFIX',
		])
			delete env[key];
		return env;
	};
	const fixtureRepo = () => {
		const root = mkdtempSync(join(tmpdir(), 'perf-guard-history-'));
		roots.push(root);
		const git = (...args: string[]) =>
			execFileSync('git', args, { cwd: root, encoding: 'utf8', env: fixtureEnv() }).trim();
		git('init', '-q', '-b', 'main');
		return { root, git };
	};

	/**
	 * A fixture repository whose commits each add one change file, measured at the given bytes, judged in order the
	 * way CI judges each one: against the history before it.
	 */
	const judgeSeries = (
		steps: { name: string; changes: object[]; bytes: number }[],
		anchor = 1000,
	) => {
		const { root, git } = fixtureRepo();
		const changes = join(root, 'scripts/benchmarks/anchor-changes');
		mkdirSync(changes, { recursive: true });
		mkdirSync(join(root, 'scripts/benchmarks/perf-guards'), { recursive: true });
		writeFileSync(
			join(root, 'scripts/benchmarks/perf-guards/anchors.json'),
			JSON.stringify(anchorsWith({ executedChars: 25_000, jsGzipBytes: anchor })),
		);
		git('add', '-A');
		git('commit', '-q', '-m', 'anchors');
		const measured = new Map<string, number>();
		return steps.map((step) => {
			writeFileSync(join(changes, `${step.name}.json`), JSON.stringify({ changes: step.changes }));
			git('add', '-A');
			git('commit', '-q', '-m', step.name);
			const sha = git('rev-parse', 'HEAD');
			const history = ledgerHistory({ root, depth: 50 });
			const baseline = buildBaseline({
				history,
				platform: PLATFORM,
				measurementAt: (i: number) => {
					const bytes = measured.get(history.chain[i].sha);
					return bytes === undefined ? undefined : { ...measurement(bytes), run: 1 };
				},
			});
			measured.set(sha, step.bytes);
			const anchors = rebaseLoadAnchors({ loadWeight: history.head.load }, baseline);
			const failures = evaluate(measurement(step.bytes), anchors).failures.filter(
				(finding) => finding.guard === 'G16',
			);
			return {
				name: step.name,
				sha,
				failures: failures.length,
				reference: baseline.subjects[PAGE],
			};
		});
	};
	const change = (field: string, delta: number) => ({
		surface: 'perf-guards',
		path: ['loadWeight', PLATFORM, PAGE, field],
		delta,
		reason: 'test',
	});
	const recorded = { name: 'r', changes: [change('jsGzipBytes', 100)], bytes: 1100 };

	test('a 0 B entry is no record: three changes each growing 47 B share one allowance', () => {
		const verdicts = judgeSeries([
			recorded,
			{ name: 'a', changes: [change('jsGzipBytes', 0)], bytes: 1147 },
			{ name: 'b', changes: [change('jsGzipBytes', 0)], bytes: 1194 },
			{ name: 'c', changes: [change('jsGzipBytes', 0)], bytes: 1241 },
		]);
		expect(verdicts.map((v) => [v.name, v.failures])).toEqual([
			['r', 0],
			['a', 0],
			['b', 1],
			['c', 1],
		]);
		expect(verdicts.at(-1)!.reference.commit).toBe(verdicts[0].sha);
	});

	test('an entry that changes only executed chars is no record of a download change', () => {
		const verdicts = judgeSeries([
			recorded,
			{ name: 'a', changes: [change('executedChars', 400)], bytes: 1147 },
			{ name: 'b', changes: [change('executedChars', 400)], bytes: 1194 },
		]);
		expect(verdicts.map((v) => [v.name, v.failures])).toEqual([
			['r', 0],
			['a', 0],
			['b', 1],
		]);
	});

	test('a platform-wide entry is no record of a download change for each page', () => {
		const platform = (name: string) => ({
			surface: 'perf-guards',
			path: ['loadWeight', 'darwin-arm64'],
			set: { [PAGE]: { executedChars: 1, jsGzipBytes: name.length } },
			reason: 'test',
		});
		const verdicts = judgeSeries([
			recorded,
			{ name: 'a', changes: [platform('a')], bytes: 1147 },
			{
				name: 'b',
				changes: [
					{
						surface: 'perf-guards',
						path: ['loadWeight', PLATFORM],
						set: { [PAGE]: { executedChars: 25_000, jsGzipBytes: 1000 } },
						reason: 'test',
					},
				],
				bytes: 1194,
			},
		]);
		expect(verdicts.map((v) => [v.name, v.failures])).toEqual([
			['r', 0],
			['a', 0],
			['b', 1],
		]);
	});

	test('a recorded change of N lets the page move by N, from the last real record', () => {
		const verdicts = judgeSeries([
			recorded,
			{ name: 'a', changes: [change('jsGzipBytes', 0)], bytes: 1130 },
			{ name: 'b', changes: [change('jsGzipBytes', 200)], bytes: 1130 + 200 + 18 },
			{ name: 'c', changes: [change('jsGzipBytes', 200)], bytes: 1130 + 200 + 19 + 200 },
		]);
		expect(verdicts.map((v) => [v.name, v.failures])).toEqual([
			['r', 0],
			['a', 0],
			['b', 0],
			['c', 0],
		]);
	});

	test('reads the repository it is given, not one a git hook names', () => {
		const outer = fixtureRepo();
		const inner = fixtureRepo();
		const anchors = (bytes: number) =>
			JSON.stringify({
				loadWeight: { [PLATFORM]: { [PAGE]: { executedChars: 1, jsGzipBytes: bytes } } },
			});
		for (const [repo, bytes] of [
			[outer, 1],
			[inner, 2],
		] as const) {
			mkdirSync(join(repo.root, 'scripts/benchmarks/perf-guards'), { recursive: true });
			writeFileSync(join(repo.root, 'scripts/benchmarks/perf-guards/anchors.json'), anchors(bytes));
			repo.git('add', '-A');
			repo.git('commit', '-q', '-m', 'one');
			repo.git('commit', '-q', '--allow-empty', '-m', 'two');
		}
		const previous = process.env.GIT_DIR;
		process.env.GIT_DIR = join(outer.root, '.git');
		try {
			const history = ledgerHistory({ root: inner.root, depth: 5 });
			expect(history.head.load[PLATFORM][PAGE].jsGzipBytes).toBe(2);
		} finally {
			if (previous === undefined) delete process.env.GIT_DIR;
			else process.env.GIT_DIR = previous;
		}
	});

	test('reads each commit’s anchors and which pages it added change entries for', () => {
		const { root, git } = fixtureRepo();
		const changes = join(root, 'scripts/benchmarks/anchor-changes');
		const anchorsFile = join(root, 'scripts/benchmarks/perf-guards/anchors.json');
		mkdirSync(changes, { recursive: true });
		mkdirSync(join(root, 'scripts/benchmarks/perf-guards'), { recursive: true });
		const load = (bytes: number) => ({
			loadWeight: {
				[PLATFORM]: {
					[PAGE]: { executedChars: 1, jsGzipBytes: bytes },
					'docs /other': { executedChars: 1, jsGzipBytes: 5 },
				},
			},
		});
		const commit = (message: string) => {
			git('add', '-A');
			git('commit', '-q', '--allow-empty', '-m', message);
			return git('rev-parse', 'HEAD');
		};
		const entry = (delta: number) => ({
			changes: [
				{
					surface: 'perf-guards',
					path: ['loadWeight', PLATFORM, PAGE, 'jsGzipBytes'],
					delta,
					reason: 'test',
				},
			],
		});
		writeFileSync(anchorsFile, JSON.stringify(load(100)));
		const first = commit('anchors');
		writeFileSync(join(changes, 'a.json'), JSON.stringify(entry(10)));
		const second = commit('a records +10');
		writeFileSync(join(root, 'unrelated.txt'), 'x');
		const third = commit('unrelated');
		writeFileSync(anchorsFile, JSON.stringify(load(110)));
		rmSync(join(changes, 'a.json'));
		const fold = commit('fold');
		writeFileSync(join(changes, 'b.json'), JSON.stringify(entry(5)));
		commit('b records +5');

		const history = ledgerHistory({ root, depth: 10 });
		const page = (marked: Set<string>) => marked.has(`${PLATFORM} ${PAGE}`);
		expect(history.head.load[PLATFORM][PAGE].jsGzipBytes).toBe(115);
		expect(page(history.head.marked)).toBe(true);
		expect(
			history.chain.map((entry) => [
				entry.sha,
				entry.load[PLATFORM][PAGE].jsGzipBytes,
				page(entry.marked),
			]),
		).toEqual([
			[fold, 110, false],
			[third, 110, false],
			[second, 110, true],
			[first, 100, false],
		]);
		expect(history.head.marked.has(`${PLATFORM} docs /other`)).toBe(false);
	});
});
