// Which node-project tests reach a heavy entry (an app build or a browser launch), from the yuku project graph.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, matchesGlob } from 'node:path';
import {
	createProjectGraph,
	isCodePath,
	type ProjectGraph,
	type WorkspacePackage,
} from './project-graph.ts';

/** A module whose import makes a test heavy, or named imports from a package that do. */
export type HeavyEntry =
	| { module: string; why: string }
	| { from: readonly string[]; names: readonly string[]; why: string };

/** A test that is heavy by a route the import graph cannot follow, such as spawning `pnpm build`. */
export type DeclaredHeavyTest = { test: string; why: string };

export type HeavyTestsManifest = {
	entries: readonly HeavyEntry[];
	/** Tests whose import closure reaches an entry. */
	tests: readonly string[];
	declared: readonly DeclaredHeavyTest[];
};

/** The import edges of every module reachable from the roots, each module parsed once. */
export type ClosureGraph = {
	edges: ReadonlyMap<string, readonly string[]>;
	/** Value imports of packages outside the repo, per module. */
	packageImports: ReadonlyMap<string, readonly { from: string; name: string | null }[]>;
	tracked: ReadonlySet<string>;
	rounds: number;
};

const git = (root: string, args: string[]) =>
	execFileSync('git', ['-C', root, ...args], { maxBuffer: 1 << 30 });

const loadYaml = (root: string): { parse(text: string): unknown } => {
	for (const base of ['package.json', 'packages/cli/package.json']) {
		try {
			return createRequire(join(root, base))('yaml');
		} catch {
			continue;
		}
	}
	throw new Error('Cannot resolve the `yaml` package. Run `pnpm install` first.');
};

export type ClosureInput = {
	/** Reads a tracked file's source, or null when it is gone. */
	read: (path: string) => Uint8Array | null;
	tracked: Set<string>;
	packages: readonly WorkspacePackage[];
};

/**
 * Parses only what the roots reach: each round analyzes the files the previous round's
 * imports named, so a file outside every test's closure is never parsed.
 */
export async function closureOf(
	input: ClosureInput,
	roots: readonly string[],
): Promise<ClosureGraph> {
	const { tracked, packages } = input;
	const edges = new Map<string, string[]>();
	const packageImports = new Map<string, { from: string; name: string | null }[]>();
	let frontier = [...new Set(roots)].filter((path) => isCodePath(path) && tracked.has(path));
	let rounds = 0;
	while (frontier.length) {
		rounds += 1;
		const files = new Map<string, Uint8Array>();
		for (const path of frontier) {
			const source = input.read(path);
			if (source) files.set(path, source);
			else tracked.delete(path);
		}
		const graph: ProjectGraph = await createProjectGraph({ files, tracked, packages });
		const next = new Set<string>();
		for (const path of files.keys()) {
			const module = graph.analyzer.module(path)!;
			const targets = [...new Set(graph.dependenciesOf(path))];
			edges.set(path, targets);
			packageImports.set(
				path,
				module.imports
					.filter(
						(record) =>
							!record.typeOnly &&
							!record.resolvedModule &&
							!/^[./]/.test(record.specifier),
					)
					.map((record) => ({
						from: record.specifier,
						name: record.isNamespace ? '*' : record.name,
					})),
			);
			for (const target of targets)
				if (
					isCodePath(target) &&
					tracked.has(target) &&
					!edges.has(target) &&
					!files.has(target)
				)
					next.add(target);
		}
		frontier = [...next];
	}
	return { edges, packageImports, tracked, rounds };
}

/** The closure over a checkout's working tree, untracked files included. */
export async function loadTestClosure(
	root: string,
	roots: readonly string[],
): Promise<ClosureGraph> {
	const tracked = new Set(
		git(root, ['ls-files', '-z', '--cached', '--others', '--exclude-standard'])
			.toString('utf8')
			.split('\0')
			.filter(Boolean),
	);
	const read = (path: string) => {
		try {
			return readFileSync(join(root, path));
		} catch {
			return null;
		}
	};
	const globs =
		(
			loadYaml(root).parse(readFileSync(join(root, 'pnpm-workspace.yaml'), 'utf8')) as {
				packages?: string[];
			}
		).packages ?? [];
	const packages: WorkspacePackage[] = [];
	for (const path of tracked) {
		if (!path.endsWith('package.json')) continue;
		const dir = path === 'package.json' ? '.' : dirname(path);
		if (dir !== '.' && !globs.some((glob) => matchesGlob(dir, glob))) continue;
		const source = read(path);
		if (!source) continue;
		try {
			const manifest = JSON.parse(Buffer.from(source).toString('utf8')) as WorkspacePackage;
			if (manifest.name) packages.push({ ...manifest, dir });
		} catch {
			continue;
		}
	}
	return closureOf({ read, tracked, packages }, roots);
}

/** For each test that reaches an entry, the import chain from the test to it. */
export function heavyTests(
	closure: ClosureGraph,
	tests: readonly string[],
	entries: readonly HeavyEntry[],
): Map<string, string[]> {
	const entryOf = (path: string): string | null => {
		for (const entry of entries) {
			if ('module' in entry) {
				if (entry.module === path) return path;
				continue;
			}
			for (const record of closure.packageImports.get(path) ?? [])
				if (
					entry.from.includes(record.from) &&
					(record.name === '*' ||
						(record.name !== null && entry.names.includes(record.name)))
				)
					return `${path} imports ${record.name === '*' ? '* as' : `{ ${record.name} }`} from '${record.from}'`;
		}
		return null;
	};
	const dependents = new Map<string, string[]>();
	for (const [path, targets] of closure.edges)
		for (const target of targets) {
			const list = dependents.get(target);
			if (list) list.push(path);
			else dependents.set(target, [path]);
		}
	// Breadth-first from every heavy module up its importers: each test gets a shortest chain.
	const next = new Map<string, string | null>();
	const reason = new Map<string, string>();
	let queue: string[] = [];
	for (const path of closure.edges.keys()) {
		const hit = entryOf(path);
		if (hit === null) continue;
		next.set(path, null);
		reason.set(path, hit);
		queue.push(path);
	}
	while (queue.length) {
		const following: string[] = [];
		for (const path of queue)
			for (const importer of dependents.get(path) ?? []) {
				if (next.has(importer)) continue;
				next.set(importer, path);
				following.push(importer);
			}
		queue = following;
	}
	const result = new Map<string, string[]>();
	for (const test of [...tests].sort()) {
		if (!next.has(test)) continue;
		const chain = [test];
		let step = next.get(test);
		while (step) {
			chain.push(step);
			step = next.get(step);
		}
		const last = chain.at(-1)!;
		if (reason.get(last) !== last) chain.push(reason.get(last)!);
		result.set(test, chain);
	}
	return result;
}

export type PlacementProblem = { kind: string; path: string; detail: string };

/** Every way the manifest disagrees with the graph; an empty list passes. */
export function checkPlacement(
	manifest: HeavyTestsManifest,
	heavy: ReadonlyMap<string, readonly string[]>,
	tests: readonly string[],
	tracked: ReadonlySet<string>,
): PlacementProblem[] {
	const problems: PlacementProblem[] = [];
	const testSet = new Set(tests);
	const listed = new Set(manifest.tests);
	const declared = new Map(manifest.declared.map((entry) => [entry.test, entry]));
	for (const entry of manifest.entries)
		if ('module' in entry && !tracked.has(entry.module))
			problems.push({ kind: 'stale entry', path: entry.module, detail: 'no such file' });
	const seen = new Set<string>();
	for (const test of [...manifest.tests, ...manifest.declared.map((entry) => entry.test)]) {
		if (seen.has(test))
			problems.push({ kind: 'duplicate', path: test, detail: 'listed twice' });
		seen.add(test);
	}
	for (const [test, chain] of heavy)
		if (!listed.has(test))
			problems.push({
				kind: declared.has(test) ? 'declared but reached' : 'missing',
				path: test,
				detail: chain.slice(1).join(' -> '),
			});
	for (const test of manifest.tests)
		if (!heavy.has(test))
			problems.push({
				kind: 'stale',
				path: test,
				detail: testSet.has(test)
					? 'its import closure no longer reaches a heavy entry'
					: 'not a node-project test file',
			});
	for (const entry of manifest.declared)
		if (!testSet.has(entry.test))
			problems.push({
				kind: 'stale',
				path: entry.test,
				detail: 'not a node-project test file',
			});
	return problems;
}
