// The one place that answers "which packages does a release cover".
//
// The answer is DERIVED from packages/*/package.json, never restated as a
// literal list. A hand-maintained copy is how `verify-publish-ready.mjs --all`
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
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const repoRoot = resolve(fileURLToPath(import.meta.url), '../../..');

/** Every packages/<dir>/package.json that parses, in directory order. */
export function workspacePackages() {
	return readdirSync(resolve(repoRoot, 'packages'), { withFileTypes: true })
		.filter((entry) => entry.isDirectory())
		.map((entry) => {
			const directory = `packages/${entry.name}`;
			const manifestPath = resolve(repoRoot, directory, 'package.json');
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
				dir: entry.name,
				directory,
				packageDir: resolve(repoRoot, directory),
				manifestPath,
				version: manifest.version,
				manifest,
			};
		})
		.filter((entry) => entry !== null);
}

/** Packages a release publishes to the registry. */
export function releasePackages() {
	return workspacePackages().filter((entry) => entry.manifest.private !== true);
}

/** Packages whose tarball must be verified, published or not yet. */
export function preparedPackages() {
	return workspacePackages().filter((entry) => entry.manifest.publishConfig !== undefined);
}

export function releasePackageNames() {
	return releasePackages().map((entry) => entry.name);
}

export function rootVersion() {
	return JSON.parse(readFileSync(resolve(repoRoot, 'package.json'), 'utf8')).version;
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
