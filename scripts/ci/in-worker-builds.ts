// Which router and bundler tests build an app inside their own vitest worker, from the yuku project graph's import records.
import type { ProjectGraph } from '../../packages/analyzer/test-support/project-graph.ts';

/** Named imports from packages that run a build in the importing process. */
export type InProcessBuildApi = { readonly from: readonly string[]; readonly names: readonly string[] };

/** A test allowed to build in its worker, and why the build cannot move to a child process. */
export type InWorkerBuild = { readonly test: string; readonly why: string };

export type InWorkerBuildRule = {
	/** Folders whose tests the rule covers. */
	readonly scope: readonly string[];
	readonly tests: readonly InWorkerBuild[];
};

export type InWorkerBuildProblem = { kind: 'unlisted' | 'stale'; path: string; detail: string };

/**
 * For each test under `scope`, the value-import chain from the test to a module that imports a
 * build API. Only import and re-export records count: a script a module spawns by path is linked
 * in the graph as an extra edge, and a build there runs in the child process, not the worker.
 */
export function inWorkerBuilds(
	graph: ProjectGraph,
	tests: readonly string[],
	apis: readonly InProcessBuildApi[],
	scope: readonly string[],
): Map<string, string[]> {
	const importers = new Map<string, string[]>();
	const reason = new Map<string, string>();
	const link = (target: string, importer: string) => {
		const list = importers.get(target);
		if (list) list.push(importer);
		else importers.set(target, [importer]);
	};
	for (const [path, module] of graph.analyzer.modules) {
		for (const record of module.imports) {
			if (record.typeOnly) continue;
			if (record.resolvedModule) {
				link(record.resolvedModule.path, path);
				continue;
			}
			const api = apis.find(
				(candidate) =>
					candidate.from.includes(record.specifier) &&
					(record.isNamespace || candidate.names.includes(record.name ?? '')),
			);
			if (api && !reason.has(path))
				reason.set(
					path,
					`${path} imports ${record.isNamespace ? '* as' : `{ ${record.name} }`} from '${record.specifier}'`,
				);
		}
		for (const record of module.exports)
			if (!record.typeOnly && record.resolvedModule) link(record.resolvedModule.path, path);
	}
	const next = new Map<string, string | null>([...reason.keys()].map((path) => [path, null]));
	let queue = [...reason.keys()];
	while (queue.length) {
		const following: string[] = [];
		for (const path of queue)
			for (const importer of importers.get(path) ?? []) {
				if (next.has(importer)) continue;
				next.set(importer, path);
				following.push(importer);
			}
		queue = following;
	}
	const result = new Map<string, string[]>();
	for (const test of [...tests].sort()) {
		if (!scope.some((folder) => test.startsWith(folder)) || !next.has(test)) continue;
		const chain = [test];
		for (let step = next.get(test); step; step = next.get(step)) chain.push(step);
		chain.push(reason.get(chain.at(-1)!)!);
		result.set(test, chain);
	}
	return result;
}

/** Every way the rule's named exceptions disagree with the graph; an empty list passes. */
export function checkInWorkerBuilds(
	rule: InWorkerBuildRule,
	found: ReadonlyMap<string, readonly string[]>,
): InWorkerBuildProblem[] {
	const listed = new Set(rule.tests.map((entry) => entry.test));
	const problems: InWorkerBuildProblem[] = [];
	for (const [test, chain] of found)
		if (!listed.has(test))
			problems.push({ kind: 'unlisted', path: test, detail: chain.slice(1).join(' -> ') });
	for (const test of listed)
		if (!found.has(test))
			problems.push({ kind: 'stale', path: test, detail: 'it no longer builds in its worker' });
	return problems;
}
