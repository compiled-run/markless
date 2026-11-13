// G16's download limit for a page: a CI measurement of an ancestor commit plus the ledger's change since then, plus the composition allowance.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { applyChanges, CHANGES_DIR } from '../anchor-ledger.mjs';
import { ANCHORS_PATH, ROOT_DIR } from './config.mjs';

export const BASELINE_ENV = 'MARKLESS_PERF_GUARD_BASELINE';

const LEDGER_PATHS = [relative(ROOT_DIR, ANCHORS_PATH), relative(ROOT_DIR, CHANGES_DIR)];

// A git hook exports these, and they would point every git command here at the hook's repository instead of `root`.
const HOOK_REPOSITORY_ENV = [
	'GIT_DIR',
	'GIT_WORK_TREE',
	'GIT_INDEX_FILE',
	'GIT_COMMON_DIR',
	'GIT_OBJECT_DIRECTORY',
	'GIT_ALTERNATE_OBJECT_DIRECTORIES',
	'GIT_PREFIX',
];

function gitIn(root, args, options = {}) {
	const env = { ...process.env };
	for (const key of HOOK_REPOSITORY_ENV) delete env[key];
	return execFileSync('git', args, { cwd: root, env, maxBuffer: 1 << 28, ...options });
}

/**
 * The commit whose measurement a page's download is judged against, as an index into `chain` (HEAD^1 first, then
 * its first parents; each entry has the page's applied anchor `value` and `marked`, whether that commit added a
 * change entry for the page). A tree that adds an entry for the page is judged against its base, so changes queued
 * ahead of it compose. A tree that adds none is judged against the last commit that did, so growth nobody recorded
 * adds up across changes. `measured(i)` says whether CI measured `chain[i]`; an unmeasured commit is crossed, and
 * whatever it changed counts against this tree.
 */
export function chooseReference({ headValue, headMarked }, chain, measured) {
	if (headValue === undefined) return { fallback: 'the page has no anchor at this commit' };
	if (chain.length === 0) return { fallback: 'no history before this commit' };
	const from = headMarked ? 0 : chain.findIndex((entry) => entry.marked);
	if (from < 0)
		return {
			fallback: `no change entry for the page in the last ${chain.length} commits, so the commit its growth is counted from is out of reach`,
		};
	for (let i = from; i < chain.length; i++) {
		if (chain[i].value === undefined)
			return { fallback: `${chain[i].sha.slice(0, 10)} has no anchor for the page` };
		if (measured(i)) return { index: i };
	}
	return { fallback: 'CI measured no commit at or before the one its growth is counted from' };
}

/** Replaces each referenced page's download anchor with its reference measurement plus the change recorded since. */
export function rebaseLoadAnchors(anchors, baseline) {
	const next = structuredClone(anchors);
	const pages = next.loadWeight?.[baseline.platform];
	if (!pages) return next;
	for (const [subject, reference] of Object.entries(baseline.subjects ?? {})) {
		const anchor = pages[subject];
		if (!anchor) continue;
		const recorded = anchor.jsGzipBytes - reference.anchored;
		pages[subject] = {
			...anchor,
			jsGzipBytes: reference.measured + recorded,
			reference: {
				commit: reference.commit,
				run: reference.run,
				measured: reference.measured,
				recorded,
			},
		};
	}
	return next;
}

/**
 * anchors with a baseline applied when it was written for this commit. MARKLESS_PERF_GUARD_BASELINE names the file,
 * or is `ci`: then scripts/ci/perf-guard-baseline.mjs writes it now, after this tree is measured, so it can wait
 * for the queue entry ahead of this one to finish measuring.
 */
export function applyBaseline(
	anchors,
	{ env = process.env, head = gitHead, log = console.error, writeCiBaseline = runCiBaseline } = {},
) {
	const value = env[BASELINE_ENV]?.trim();
	if (!value) return anchors;
	const file = value === 'ci' ? writeCiBaseline() : value;
	const baseline = JSON.parse(readFileSync(file, 'utf8'));
	const sha = head();
	if (baseline.head !== sha) {
		log(
			`[perf-guard] ${file} was written for ${baseline.head}, not ${sha}; G16 downloads use the anchors alone`,
		);
		return anchors;
	}
	for (const [subject, reason] of Object.entries(baseline.fallbacks ?? {}))
		log(`[perf-guard] G16 ${subject}: judged against its anchor alone: ${reason}`);
	return rebaseLoadAnchors(anchors, baseline);
}

function runCiBaseline() {
	const file = join(mkdtempSync(join(tmpdir(), 'perf-guard-baseline-')), 'baseline.json');
	execFileSync(process.execPath, [join(ROOT_DIR, 'scripts/ci/perf-guard-baseline.mjs'), '--out', file], {
		cwd: ROOT_DIR,
		stdio: ['ignore', 'inherit', 'inherit'],
	});
	return file;
}

function gitHead() {
	return gitIn(ROOT_DIR, ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
}

/** The perf-guard anchor file and change files as committed at `sha`. */
export function ledgerFilesAt(sha, { root = ROOT_DIR } = {}) {
	const [anchorsPath, changesDir] = LEDGER_PATHS;
	const names = gitIn(root, ['ls-tree', '--name-only', sha, `${changesDir}/`], {
		encoding: 'utf8',
	})
		.split('\n')
		.filter((path) => path.endsWith('.json'))
		.sort();
	const paths = [anchorsPath, ...names];
	const blobs = gitIn(root, ['cat-file', '--batch'], {
		input: paths.map((path) => `${sha}:${path}`).join('\n'),
	});
	const contents = [];
	let at = 0;
	for (const path of paths) {
		const end = blobs.indexOf(10, at);
		const header = blobs.subarray(at, end).toString('utf8');
		const size = Number(header.split(' ')[2]);
		if (!Number.isFinite(size)) throw new Error(`git cat-file: ${header} for ${sha}:${path}`);
		contents.push(blobs.subarray(end + 1, end + 1 + size).toString('utf8'));
		at = end + 1 + size + 1;
	}
	return {
		anchors: JSON.parse(contents[0]),
		files: names.map((path, i) => ({
			name: path.split('/').pop().slice(0, -'.json'.length),
			changes: JSON.parse(contents[i + 1]).changes,
		})),
	};
}

/** The perf-guard anchors with every change file applied, as committed at `sha`. */
export function ledgerAt(sha, options) {
	const { anchors, files } = ledgerFilesAt(sha, options);
	return applyChanges(anchors, files, 'perf-guards');
}

/** Every load-anchor change entry in a ledger, keyed by the page it names (`<platform> <page>`). */
function loadEntries({ files }) {
	const keys = new Map();
	for (const file of files)
		for (const entry of file.changes) {
			if (entry.surface !== 'perf-guards' || entry.path[0] !== 'loadWeight') continue;
			const page = entry.path.length > 2 ? `${entry.path[1]} ${entry.path[2]}` : `${entry.path[1]} *`;
			const key = `${file.name}\u0000${JSON.stringify(entry)}`;
			keys.set(page, (keys.get(page) ?? new Set()).add(key));
		}
	return keys;
}

/** The pages (`<platform> <page>`, or `<platform> *`) whose change entries at `after` include one `before` lacks. */
function markedPages(before, after) {
	const marked = new Set();
	for (const [page, keys] of after)
		for (const key of keys) if (!before.get(page)?.has(key)) marked.add(page);
	return marked;
}

const loadOf = (anchors) => anchors.loadWeight ?? {};

/**
 * HEAD and up to `depth` of its first parents, each with its applied load anchors and the pages it added change
 * entries for. The ledger is read only at commits that touched it; any other commit carries the nearest older one's.
 */
export function ledgerHistory({ root = ROOT_DIR, depth = 300, rev = 'HEAD' } = {}) {
	const git = (...args) => gitIn(root, args, { encoding: 'utf8' }).trim();
	const head = git('rev-parse', rev);
	const headLedger = ledgerFilesAt(head, { root });
	const headOf = (ledger) => applyChanges(ledger.anchors, ledger.files, 'perf-guards');
	const chain = git('rev-list', '--first-parent', `--max-count=${depth}`, `${head}^1`)
		.split('\n')
		.filter(Boolean);
	if (chain.length === 0)
		return {
			head: { sha: head, load: loadOf(headOf(headLedger)), marked: new Set() },
			chain: [],
		};
	const touched = new Set(
		git('rev-list', '--first-parent', `${chain.at(-1)}..${head}^1`, '--', ...LEDGER_PATHS)
			.split('\n')
			.filter(Boolean),
	);
	const entries = Array.from({ length: chain.length });
	let ledger = ledgerFilesAt(chain.at(-1), { root });
	let load = loadOf(headOf(ledger));
	let previous = loadEntries(ledger);
	entries[chain.length - 1] = { sha: chain.at(-1), load, marked: new Set() };
	for (let i = chain.length - 2; i >= 0; i--) {
		let marked = new Set();
		if (touched.has(chain[i])) {
			ledger = ledgerFilesAt(chain[i], { root });
			load = loadOf(headOf(ledger));
			const current = loadEntries(ledger);
			marked = markedPages(previous, current);
			previous = current;
		}
		entries[i] = { sha: chain[i], load, marked };
	}
	return {
		head: {
			sha: head,
			load: loadOf(headOf(headLedger)),
			marked: markedPages(previous, loadEntries(headLedger)),
		},
		chain: entries,
	};
}

/** The measured download bytes of one page, or undefined. */
export function measuredDownload(measurement, subject) {
	const space = subject.indexOf(' ');
	return measurement?.sites?.[subject.slice(0, space)]?.routes?.[subject.slice(space + 1)]?.load
		?.jsGzipBytes;
}

const marks = (marked, platform, subject) =>
	marked.has(`${platform} ${subject}`) || marked.has(`${platform} *`);

/**
 * Picks every page's reference from the history. `measurementAt(i)` returns CI's measurement of `chain[i]`
 * or undefined; it is called lazily and should cache.
 */
export function buildBaseline({ history, platform, measurementAt }) {
	const subjects = {};
	const fallbacks = {};
	const headPages = history.head.load[platform] ?? {};
	for (const subject of Object.keys(headPages).sort()) {
		const chain = history.chain.map((entry) => ({
			sha: entry.sha,
			value: entry.load[platform]?.[subject]?.jsGzipBytes,
			marked: marks(entry.marked, platform, subject),
		}));
		const usable = (i) => {
			const measurement = measurementAt(i);
			return (
				measurement !== undefined &&
				(measurement.platform ?? platform) === platform &&
				measuredDownload(measurement, subject) !== undefined
			);
		};
		const pick = chooseReference(
			{
				headValue: headPages[subject].jsGzipBytes,
				headMarked: marks(history.head.marked, platform, subject),
			},
			chain,
			usable,
		);
		if ('fallback' in pick) {
			fallbacks[subject] = pick.fallback;
			continue;
		}
		const measurement = measurementAt(pick.index);
		subjects[subject] = {
			commit: chain[pick.index].sha,
			run: measurement.run ?? null,
			measured: measuredDownload(measurement, subject),
			anchored: chain[pick.index].value,
		};
	}
	return { head: history.head.sha, platform, subjects, fallbacks };
}
