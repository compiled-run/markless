// Which rungs a change can affect, from the yuku project graph: a rung reads its own folder and the modules its entry
// files import; every rung reads the toolchain (the harness and the compiler it imports) and the hosts.
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { join, matchesGlob, relative } from 'node:path';
import {
	loadProjectGraph,
	RUN_ALL_PATHS,
	type ProjectGraph,
} from '../../../analyzer/test-support/project-graph.ts';
import { proofsDir, repoRoot } from './bundle.ts';

/** The modules every rung's run executes: each one's import closure is the toolchain. */
const TOOLCHAIN_ENTRIES = [
	'packages/mobile/src/harness/cli.ts',
	'packages/mobile/src/runner/bundle.ts',
	'packages/mobile/src/runner/run-chunk.ts',
];
/** Inputs of every rung that are not modules in the graph: the Swift and Kotlin hosts, the shells and the hosts' test vectors. */
const HOST_FOLDERS = [
	'packages/mobile/src/adapters/',
	'packages/mobile/src/harness/shells/',
	'packages/mobile/conformance/',
];

export type RungSelection = {
	/** Why every rung is affected, when one change reaches them all. */
	readonly all: string | null;
	readonly rungs: ReadonlyArray<{ readonly name: string; readonly because: string }>;
};

const git = (args: string[]) =>
	execFileSync('git', args, { cwd: repoRoot, encoding: 'utf8', maxBuffer: 1 << 28 });
const lines = (text: string) => text.split('\n').filter(Boolean);

/** Committed changes since the merge base with `base`, uncommitted ones, and new files git does not ignore. */
export function changedPaths(base: string): string[] {
	const mergeBase = git(['merge-base', base, 'HEAD']).trim();
	return [
		...new Set([
			...lines(git(['diff', '--name-only', `${mergeBase}`, 'HEAD'])),
			...lines(git(['diff', '--name-only', 'HEAD'])),
			...lines(git(['ls-files', '--others', '--exclude-standard'])),
		]),
	].sort();
}

export const defaultBase = (): string => {
	const integration = 'origin/cw/native-integration';
	return git(['rev-parse', '--verify', '--quiet', integration]).trim()
		? integration
		: 'origin/main';
};

/** The files the graph says `entries` import, transitively, with the importers whose local imports did not resolve. */
function closure(graph: ProjectGraph, entries: ReadonlyArray<string>) {
	const reached = new Set<string>();
	const unresolved: string[] = [];
	const queue = [...entries];
	while (queue.length > 0) {
		const path = queue.pop()!;
		if (reached.has(path)) continue;
		reached.add(path);
		if ((graph.unresolved.get(path) ?? []).length > 0) unresolved.push(path);
		queue.push(...graph.dependenciesOf(path));
	}
	return { reached, unresolved };
}

/** A rung's entry modules: `App.tsrx`, or every page under `pages/` and the app's `document.tsrx`. */
function rungEntries(folder: string): string[] {
	const dir = join(proofsDir, folder);
	const rel = (file: string) => relative(repoRoot, file);
	if (existsSync(join(dir, 'App.tsrx'))) return [rel(join(dir, 'App.tsrx'))];
	const pages = existsSync(join(dir, 'pages'))
		? readdirSync(join(dir, 'pages'), { recursive: true, withFileTypes: true })
				.filter((entry) => entry.isFile())
				.map((entry) => rel(join(entry.parentPath, entry.name)))
		: [];
	return [
		...pages,
		...(existsSync(join(dir, 'document.tsrx')) ? [rel(join(dir, 'document.tsrx'))] : []),
	];
}

export async function affectedRungs(
	changed: ReadonlyArray<string>,
	folders: ReadonlyArray<string>,
	loadGraph: () => Promise<ProjectGraph> = async () => (await loadProjectGraph(repoRoot)).graph,
): Promise<RungSelection> {
	const every = (because: string): RungSelection => ({
		all: because,
		rungs: folders.map((name) => ({ name, because })),
	});
	for (const path of changed) {
		const rule = RUN_ALL_PATHS.find((candidate) => matchesGlob(path, candidate.glob));
		if (rule) return every(`${rule.reason}: ${path}`);
		const host = HOST_FOLDERS.find((folder) => path.startsWith(folder));
		if (host) return every(`the hosts changed: ${path}`);
	}
	const graph = await loadGraph();
	const toolchain = closure(graph, TOOLCHAIN_ENTRIES);
	const reachesToolchain = changed.find((path) => toolchain.reached.has(path));
	if (reachesToolchain) return every(`the toolchain imports ${reachesToolchain}`);
	const deleted = changed.find((path) => !existsSync(join(repoRoot, path)));
	if (deleted && toolchain.unresolved.length > 0)
		return every(
			`${deleted} is gone and an import in ${toolchain.unresolved[0]} does not resolve`,
		);

	const appConfig = relative(repoRoot, join(proofsDir, 'app.json'));
	const rungs: Array<{ name: string; because: string }> = [];
	for (const name of folders) {
		const folder = `${relative(repoRoot, join(proofsDir, name))}/`;
		const own = changed.find((path) => path.startsWith(folder));
		if (own) {
			rungs.push({ name, because: `its folder changed: ${own}` });
			continue;
		}
		if (changed.includes(appConfig)) {
			rungs.push({ name, because: `the app config changed: ${appConfig}` });
			continue;
		}
		const reads = closure(graph, rungEntries(name));
		const imported = changed.find((path) => reads.reached.has(path));
		if (imported) rungs.push({ name, because: `it imports ${imported}` });
		else if (reads.unresolved.length > 0 && changed.length > 0)
			rungs.push({
				name,
				because: `an import in ${reads.unresolved[0]} does not resolve, so the graph cannot rule it out`,
			});
	}
	return { all: null, rungs };
}
