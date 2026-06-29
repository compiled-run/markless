import { normalize } from 'pathe';
import { parsePath, withLeadingSlash } from 'ufo';
import type { ArcadeEnvironment } from './types.ts';

export function createArcadeDevGraph() {
	const parentModules = new Map<string, Set<string>>();

	return {
		record(parent: string, ids: Iterable<string>, environment: ArcadeEnvironment) {
			const entries = [...ids];
			for (const path of parentKeys(parent)) {
				const key = parentKey(environment, path);
				const existing = parentModules.get(key) ?? new Set<string>();
				for (const id of entries) {
					existing.add(id);
				}
				parentModules.set(key, existing);
			}
		},
		clear(parent: string, environment?: ArcadeEnvironment) {
			const deleted: string[] = [];
			for (const currentEnvironment of targetEnvironments(environment)) {
				for (const path of parentKeys(parent)) {
					const key = parentKey(currentEnvironment, path);
					const ids = parentModules.get(key);
					if (!ids) continue;
					deleted.push(...ids);
					parentModules.delete(key);
				}
			}
			return [...new Set(deleted)];
		},
		reset() {
			parentModules.clear();
		},
	};
}

function targetEnvironments(environment: ArcadeEnvironment | undefined) {
	if (environment) {
		return [environment];
	}

	return allEnvironments;
}

const allEnvironments: readonly ArcadeEnvironment[] = ['client', 'server', 'lib'];

function parentKeys(parent: string) {
	const path = pathname(parent);
	const normalized = normalize(path);
	const leadingPath = withLeadingSlash(normalized);
	const barePath = leadingPath.slice(1);
	return new Set([path, normalized, leadingPath, barePath]);
}

function parentKey(environment: ArcadeEnvironment, parent: string) {
	return `${environment}:${parent}`;
}

function pathname(id: string) {
	return parsePath(id).pathname;
}
