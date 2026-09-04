// The one place that answers "which packages does a release cover".
//
// The answer is derived from pnpm-workspace.yaml, never restated as a literal
// list. A hand-maintained copy is how `verify-publish-ready.mjs --all`
// silently stopped checking @markless/analyzer and @markless/typescript-plugin,
// and it is what CLAUDE.md forbids ("config facts are imported from their
// owning package, never restated as literals").
//
// Two sets, both derived:
//
//   releasePackages()  - `private !== true`. What a release actually publishes.
//   preparedPackages() - carries `publishConfig`. Everything whose tarball must
//                        be verifiable, including packages still held private
//                        on purpose (@markless/vitest-browser), so preparation
//                        work is proven before the flag is ever flipped.
import { globSync, readFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';

export const repoRoot = resolve(fileURLToPath(import.meta.url), '../../..');

/** Every package.json selected by pnpm-workspace.yaml, in path order. */
export function workspacePackages(root = repoRoot) {
	const workspace = parse(readFileSync(resolve(root, 'pnpm-workspace.yaml'), 'utf8'));
	const patterns = Array.isArray(workspace?.packages) ? workspace.packages : [];
	const manifestPaths = new Set();
	const excludedManifestPaths = new Set();
	for (const pattern of patterns) {
		if (typeof pattern !== 'string') continue;
		const excluded = pattern.startsWith('!');
		const packagePattern = `${excluded ? pattern.slice(1) : pattern}/package.json`;
		for (const manifestPath of globSync(packagePattern, { cwd: root })) {
			if (excluded) excludedManifestPaths.add(manifestPath);
			else manifestPaths.add(manifestPath);
		}
	}

	return [...manifestPaths]
		.filter((manifestPath) => !excludedManifestPaths.has(manifestPath))
		.sort()
		.map((relativeManifestPath) => {
			const manifestPath = resolve(root, relativeManifestPath);
			const directory = relative(root, dirname(manifestPath));
			let manifest;
			try {
				manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
			} catch {
				return null;
			}
			if (typeof manifest?.name !== 'string') {
				return null;
			}
			return {
				name: manifest.name,
				dir: directory,
				directory,
				packageDir: resolve(root, directory),
				manifestPath,
				version: manifest.version,
				manifest,
			};
		})
		.filter((entry) => entry !== null);
}

/** Packages a release publishes to the registry. */
export function releasePackages(root = repoRoot) {
	return workspacePackages(root).filter((entry) => entry.manifest.private !== true);
}

/** Packages whose tarball must be verified, published or not yet. */
export function preparedPackages() {
	return workspacePackages().filter((entry) => entry.manifest.publishConfig !== undefined);
}

export function releasePackageNames() {
	return releasePackages().map((entry) => entry.name);
}

export function rootVersion(root = repoRoot) {
	return JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')).version;
}

/**
 * Lockstep guard. `create-markless` scaffolds `^<its own version>` for every
 * @markless dependency, so a release where the versions disagree produces a
 * scaffold that cannot resolve. Returns the agreed version or throws.
 */
export function assertVersionLockstep(expected = rootVersion()) {
	const root = rootVersion();
	const mismatches = [];
	if (root !== expected) {
		mismatches.push(`package.json (root): ${root}`);
	}
	for (const entry of releasePackages()) {
		if (entry.version !== expected) {
			mismatches.push(`${entry.name}: ${entry.version ?? 'missing'}`);
		}
	}
	if (mismatches.length > 0) {
		throw new Error(
			`version lockstep failed: expected every manifest at ${expected}, but found:\n` +
				mismatches.map((line) => `  - ${line}`).join('\n'),
		);
	}
	return expected;
}
