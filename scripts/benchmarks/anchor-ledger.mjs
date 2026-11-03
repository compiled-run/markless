#!/usr/bin/env node
// Anchor files hold main's anchors as of the last fold; each pull request records its own changes in its own file.
import { execFileSync } from 'node:child_process';
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	realpathSync,
	rmSync,
	writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { ANCHORS_PATH, ROOT_DIR as ROOT } from './perf-guards/config.mjs';

export const CHANGES_DIR = join(import.meta.dirname, 'anchor-changes');
export const FIXTURE_RUNTIME_ANCHORS_PATH = join(
	ROOT,
	'packages/bundler/test/fixture-runtime-anchors.json',
);

const PERF_GUARD_NAMES = {
	allowFullResume: 'lean',
	constructGlue: 'construct',
	execution: 'execution',
	lean: 'lean',
	loadWeight: 'load',
	resumeData: 'resume',
	resumeRows: 'resume',
	runtimeModules: 'runtime',
};

const sortKeys = (object) =>
	Object.fromEntries(
		Object.keys(object)
			.sort()
			.map((key) => [key, object[key]]),
	);

export const SURFACES = {
	'perf-guards': {
		path: ANCHORS_PATH,
		subjectDepth: (path) =>
			path[0] === 'loadWeight' ? 3 : path[0] === 'allowFullResume' ? 1 : 2,
		label: (subject) => ({
			guard: PERF_GUARD_NAMES[subject[0]] ?? subject[0],
			subject:
				subject[0] === 'loadWeight'
					? `${subject[2]} (${subject[1]})`
					: (subject[1] ?? subject[0]),
		}),
		unit: (path) =>
			({
				executedChars: 'chars of JS executed',
				jsGzipBytes: 'B gzip downloaded',
				functions: 'functions called',
				modules: 'modules initialized',
				raw: 'B raw resume data',
				gzip: 'B gzip resume data',
			})[path.at(-1)] ??
			{
				runtimeModules: 'B rendered',
				constructGlue: 'B per instance',
				resumeRows: 'B per row',
			}[path[0]] ??
			'',
		normalize: (anchors) => {
			if (anchors.runtimeModules) anchors.runtimeModules = sortKeys(anchors.runtimeModules);
			return anchors;
		},
	},
	'fixture-runtime': {
		path: FIXTURE_RUNTIME_ANCHORS_PATH,
		subjectDepth: () => 3,
		label: (subject) => ({
			guard: subject[0] === 'walls' ? 'wall' : 'runtime module',
			subject: `${subject[1]} ${subject[2]}`,
		}),
		unit: (path) => (path[0] === 'walls' ? 'B gzip emitted' : 'B rendered'),
		normalize: (anchors) => {
			for (const section of ['modules', 'walls']) {
				const fixtures = sortKeys(anchors[section] ?? {});
				for (const fixture of Object.keys(fixtures))
					fixtures[fixture] = sortKeys(fixtures[fixture]);
				anchors[section] = fixtures;
			}
			return anchors;
		},
	},
};

const OPS = ['delta', 'set', 'remove', 'append'];
const opOf = (entry) => OPS.find((op) => op in entry);
const isPlainObject = (value) =>
	value !== null && typeof value === 'object' && !Array.isArray(value);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const where = (entry) => `${entry.surface} ${JSON.stringify(entry.path)}`;

function surfaceOf(name) {
	const surface = SURFACES[name];
	if (!surface)
		throw new Error(
			`unknown anchor surface "${name}"; one of ${Object.keys(SURFACES).join(', ')}`,
		);
	return surface;
}

function readJson(path) {
	return JSON.parse(readFileSync(path, 'utf8'));
}

function writeJson(path, value) {
	writeFileSync(path, `${JSON.stringify(value, null, '\t')}\n`);
}

function parentOf(object, path, create) {
	let node = object;
	for (const key of path.slice(0, -1)) {
		if (!isPlainObject(node[key])) {
			if (!create) return undefined;
			node[key] = {};
		}
		node = node[key];
	}
	return node;
}

function getPath(object, path) {
	const parent = parentOf(object, path, false);
	return parent === undefined ? undefined : parent[path.at(-1)];
}

/** One line per recorded change, with what its number counts. */
export function formatChange(entry) {
	const surface = surfaceOf(entry.surface);
	const { guard, subject } = labelOf(entry);
	const field = entry.path.slice(surface.subjectDepth(entry.path)).join('.');
	const op = opOf(entry);
	const value =
		op === 'delta'
			? `${entry.delta > 0 ? '+' : ''}${entry.delta} ${surface.unit(entry.path)}`
			: op === 'remove'
				? 'removed'
				: `${op} ${JSON.stringify(entry[op])}`;
	return `${guard} ${subject}${field ? ` ${field}` : ''}: ${value}`;
}

/** Every change file in the ledger directory, sorted by name. */
export function readChangeFiles(dir = CHANGES_DIR) {
	if (!existsSync(dir)) return [];
	return readdirSync(dir)
		.filter((file) => file.endsWith('.json'))
		.sort()
		.map((file) => {
			const name = file.slice(0, -'.json'.length);
			const { changes } = readJson(join(dir, file));
			if (!Array.isArray(changes)) throw new Error(`${file}: expected { "changes": [...] }`);
			for (const entry of changes) validateEntry(entry, name);
			return { name, changes };
		});
}

function validateEntry(entry, name) {
	const at = `${name}: ${where(entry)}`;
	surfaceOf(entry.surface);
	if (!Array.isArray(entry.path) || entry.path.length === 0)
		throw new Error(`${name}: an entry has no path`);
	if (OPS.filter((op) => op in entry).length !== 1)
		throw new Error(`${at}: needs exactly one of ${OPS.join(', ')}`);
	if ('delta' in entry && (typeof entry.delta !== 'number' || !Number.isFinite(entry.delta)))
		throw new Error(`${at}: delta must be a number`);
	if ('append' in entry && !Array.isArray(entry.append))
		throw new Error(`${at}: append must be an array`);
	if (!entry.reason?.trim()) throw new Error(`${at}: every change needs a one-line reason`);
}

/** The anchors a guard checks: the anchor file with every change file of this surface applied. Throws on conflicting changes. */
export function applyChanges(base, files, surfaceName) {
	const anchors = structuredClone(base);
	const entries = files.flatMap((file) =>
		file.changes
			.filter((entry) => entry.surface === surfaceName)
			.map((entry) => ({ ...entry, file: file.name })),
	);
	const owner = new Map();
	for (const entry of entries) {
		const op = opOf(entry);
		if (op === 'delta' || op === 'append') continue;
		const key = JSON.stringify(entry.path);
		const earlier = owner.get(key);
		if (earlier)
			throw new Error(
				`${where(entry)}: changed by both ${earlier} and ${entry.file}. The later pull request runs accept again on a tree with both.`,
			);
		owner.set(key, entry.file);
		const parent = parentOf(anchors, entry.path, op === 'set');
		const leaf = entry.path.at(-1);
		const current = parent?.[leaf];
		if (op === 'remove') {
			if (current === undefined)
				throw new Error(
					`${entry.file}: ${where(entry)} removes an anchor that does not exist`,
				);
			delete parent[leaf];
		} else {
			if (typeof current === 'number')
				throw new Error(
					`${entry.file}: ${where(entry)} sets an anchor that exists; record a delta`,
				);
			parent[leaf] = structuredClone(entry.set);
		}
	}
	for (const entry of entries) {
		const op = opOf(entry);
		if (op === 'append') {
			const parent = parentOf(anchors, entry.path, true);
			const leaf = entry.path.at(-1);
			if (parent[leaf] !== undefined && !Array.isArray(parent[leaf]))
				throw new Error(
					`${entry.file}: ${where(entry)} appends to an anchor that is not a list`,
				);
			parent[leaf] = [...(parent[leaf] ?? []), ...structuredClone(entry.append)];
		}
		if (op !== 'delta') continue;
		const parent = parentOf(anchors, entry.path, false);
		const leaf = entry.path.at(-1);
		if (typeof parent?.[leaf] !== 'number')
			throw new Error(
				`${entry.file}: ${where(entry)} changes an anchor that ${parent?.[leaf] === undefined ? 'does not exist' : 'is not a number'}`,
			);
		parent[leaf] += entry.delta;
	}
	return anchors;
}

/** The changes that turn `before` into `after`, as ledger operations; `history` is the fold's, never a change. */
export function diffAnchors(before, after, path = []) {
	if (typeof before === 'number' && typeof after === 'number')
		return before === after ? [] : [{ path, delta: after - before }];
	if (isPlainObject(before) && isPlainObject(after)) {
		const ops = [];
		for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
			if (path.length === 0 && key === 'history') continue;
			if (!(key in after)) ops.push({ path: [...path, key], remove: true });
			else if (!(key in before)) ops.push({ path: [...path, key], set: after[key] });
			else ops.push(...diffAnchors(before[key], after[key], [...path, key]));
		}
		return ops;
	}
	if (same(before, after)) return [];
	if (
		Array.isArray(before) &&
		Array.isArray(after) &&
		same(after.slice(0, before.length), before)
	)
		return [{ path, append: after.slice(before.length) }];
	return [{ path, set: after }];
}

/** The change file this checkout writes: MARKLESS_ANCHOR_CHANGE, else the current git branch. */
export function changeName(env = process.env) {
	const explicit = env.MARKLESS_ANCHOR_CHANGE?.trim();
	let name = explicit;
	if (!name) {
		try {
			name = execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], {
				cwd: ROOT,
				encoding: 'utf8',
			}).trim();
		} catch {
			name = '';
		}
	}
	const slug = name.replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '');
	if (!slug || slug === 'HEAD' || slug === 'main')
		throw new Error(
			'Anchor changes are recorded per branch: check out a branch other than main, or set MARKLESS_ANCHOR_CHANGE=<name>.',
		);
	if (!explicit && landedOnMain(slug))
		throw new Error(
			`A change file named ${slug}.json already landed on main; set MARKLESS_ANCHOR_CHANGE=<another name> so this branch records its own.`,
		);
	return slug;
}

function landedOnMain(name) {
	const file = relative(ROOT, join(CHANGES_DIR, `${name}.json`));
	try {
		execFileSync('git', ['cat-file', '-e', `origin/main:${file}`], {
			cwd: ROOT,
			stdio: 'ignore',
		});
		return true;
	} catch {
		return false;
	}
}

/** Anchors with every change file applied, or with every one except `exclude`. */
export function readAnchorsWithChanges(surfaceName, { exclude, dir = CHANGES_DIR, base } = {}) {
	const files = readChangeFiles(dir).filter((file) => file.name !== exclude);
	return applyChanges(base ?? readJson(surfaceOf(surfaceName).path), files, surfaceName);
}

/**
 * Records this branch's own change for one surface: `head` and `base` each anchor a copy of the other
 * branches' anchors to a measurement (of this tree and of its merge-base, same machine, same command), and
 * their difference is the entry. Measuring against the anchors instead would charge main's unrecorded
 * drift to every open branch, once each. Earlier entries `covers` names are replaced; the rest are kept.
 */
export function recordChange(
	surfaceName,
	{ head, base, covers },
	{
		name = changeName(),
		dir = CHANGES_DIR,
		basePath = surfaceOf(surfaceName).path,
		reason,
		date = new Date().toISOString().slice(0, 10),
	} = {},
) {
	if (!reason?.trim()) throw new Error('recording an anchor change needs a one-line reason');
	if (typeof head !== 'function' || typeof base !== 'function' || typeof covers !== 'function')
		throw new Error('recordChange needs head, base and covers');
	const anchorFile = readJson(basePath);
	const others = applyChanges(
		anchorFile,
		readChangeFiles(dir).filter((file) => file.name !== name),
		surfaceName,
	);
	const file = join(dir, `${name}.json`);
	const previous = existsSync(file) ? readJson(file).changes : [];
	const opKey = (entry) => JSON.stringify([entry.path, opOf(entry), entry[opOf(entry)]]);
	const ops = diffAnchors(base(structuredClone(others)), head(structuredClone(others))).map(
		(op) =>
			previous.find(
				(entry) => entry.surface === surfaceName && opKey(entry) === opKey(op),
			) ?? { surface: surfaceName, ...op, reason: reason.trim(), date },
	);
	const replaced = new Set(ops.map((op) => JSON.stringify(op.path)));
	const kept = previous.filter(
		(entry) =>
			entry.surface !== surfaceName ||
			(!covers(entry) && !replaced.has(JSON.stringify(entry.path))),
	);
	const changes = [...kept, ...ops];
	applyChanges(
		anchorFile,
		[...readChangeFiles(dir).filter((other) => other.name !== name), { name, changes }],
		surfaceName,
	);
	if (changes.length === 0) rmSync(file, { force: true });
	else {
		mkdirSync(dir, { recursive: true });
		writeJson(file, { changes });
	}
	return { file, changes: ops };
}

/** The subject an entry belongs to, as its guard and subject names. */
export function labelOf(entry) {
	const surface = surfaceOf(entry.surface);
	return surface.label(entry.path.slice(0, surface.subjectDepth(entry.path)));
}

/** The commit a change is measured against: MARKLESS_ACCEPT_BASE_REF, else where this branch left origin/main. */
export function mergeBaseRef(env = process.env) {
	if (env.MARKLESS_ACCEPT_BASE_REF?.trim()) return env.MARKLESS_ACCEPT_BASE_REF.trim();
	return execFileSync('git', ['merge-base', 'HEAD', 'origin/main'], {
		cwd: ROOT,
		encoding: 'utf8',
	}).trim();
}

/** A throwaway, installed checkout of the merge-base; `close()` removes it. */
export function openMergeBaseCheckout({ rev = mergeBaseRef(), log = console.error } = {}) {
	const root = mkdtempSync(join(realpathSync(tmpdir()), 'markless-merge-base-'));
	const run = (command, args, cwd) =>
		execFileSync(command, args, { cwd, stdio: ['ignore', 'ignore', 'inherit'] });
	log(`[anchors] measuring the merge-base ${rev.slice(0, 10)} in ${root}`);
	run('git', ['worktree', 'add', '--detach', root, rev], ROOT);
	const close = () => {
		run('git', ['worktree', 'remove', '--force', root], ROOT);
		rmSync(root, { recursive: true, force: true });
	};
	try {
		run('pnpm', ['install', '--frozen-lockfile', '--offline'], root);
	} catch (error) {
		close();
		throw error;
	}
	return { root, rev, close };
}

/** Writes every change into its anchor file with a history line per changed anchor, and deletes the change files. */
export function fold({
	dir = CHANGES_DIR,
	surfaces = SURFACES,
	date = new Date().toISOString().slice(0, 10),
} = {}) {
	const files = readChangeFiles(dir);
	const folded = {};
	for (const [surfaceName, surface] of Object.entries(surfaces)) {
		if (!files.some((file) => file.changes.some((entry) => entry.surface === surfaceName)))
			continue;
		const base = readJson(surface.path);
		const next = surface.normalize(applyChanges(base, files, surfaceName));
		const subjects = new Map();
		for (const file of files)
			for (const entry of file.changes) {
				if (entry.surface !== surfaceName) continue;
				const subject = entry.path.slice(0, surface.subjectDepth(entry.path));
				const key = JSON.stringify(subject);
				const group = subjects.get(key) ?? { subject, reasons: new Map() };
				group.reasons.set(file.name, entry.reason.trim());
				subjects.set(key, group);
			}
		next.history = [...(base.history ?? [])];
		for (const { subject, reasons } of subjects.values()) {
			const from = getPath(base, subject);
			const to = getPath(next, subject);
			if (same(from, to)) continue;
			next.history.push({
				date,
				...surface.label(subject),
				from: from ?? null,
				to: to ?? null,
				reason:
					reasons.size === 1
						? [...reasons.values()][0]
						: [...reasons].map(([name, reason]) => `${name}: ${reason}`).join('; '),
			});
		}
		writeJson(surface.path, next);
		folded[surfaceName] = next;
	}
	for (const file of files) rmSync(join(dir, `${file.name}.json`));
	return { files: files.map((file) => file.name), folded };
}

if (import.meta.url === `file://${process.argv[1]}`) {
	const command = process.argv[2];
	try {
		if (command === 'fold') {
			const { files } = fold();
			console.log(
				files.length
					? `folded ${files.length} change files: ${files.join(', ')}`
					: 'no change files to fold',
			);
		} else if (command === 'check') {
			const files = readChangeFiles();
			for (const surfaceName of Object.keys(SURFACES)) readAnchorsWithChanges(surfaceName);
			console.log(`${files.length} change files apply cleanly`);
		} else {
			console.error('usage: node scripts/benchmarks/anchor-ledger.mjs <check|fold>');
			process.exit(2);
		}
	} catch (error) {
		console.error(error.message ?? error);
		process.exit(1);
	}
}
