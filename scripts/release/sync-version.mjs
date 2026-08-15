// Rewrite every derived release package to the root version, or report drift.
//
// The release set comes from releasePackages() — never a literal list.
// MARKLESS_REPO_ROOT is a test-only seam for fixture repositories; production
// callers leave it unset and use repoRoot.
//
// Usage: node scripts/release/sync-version.mjs [--check]
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { releasePackages, repoRoot, rootVersion } from './release-packages.mjs';

const args = process.argv.slice(2);
if (args.length > 1 || (args.length === 1 && args[0] !== '--check')) {
	console.error('usage: node scripts/release/sync-version.mjs [--check]');
	process.exit(1);
}

const check = args[0] === '--check';
const root = process.env.MARKLESS_REPO_ROOT
	? resolve(process.env.MARKLESS_REPO_ROOT)
	: repoRoot;
const version = rootVersion(root);

if (
	typeof version !== 'string' ||
	!(
		/^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(
			version,
		)
	)
) {
	console.error(`release: root package version is not semver text: ${String(version)}`);
	process.exit(1);
}

const mismatches = releasePackages(root).filter((entry) => entry.version !== version);

if (check && mismatches.length > 0) {
	console.error(`release: expected every release manifest at ${version}, but found:`);
	for (const entry of mismatches) {
		console.error(`  - ${entry.name}: ${entry.version ?? 'missing'}`);
	}
	process.exit(1);
}

if (check) {
	process.exit(0);
}

for (const entry of mismatches) {
	const source = readFileSync(entry.manifestPath, 'utf8');
	const indentation = source.match(/^([ \t]+)"/m)?.[1] ?? '\t';
	const finalNewline = source.endsWith('\n') ? '\n' : '';
	const manifest = { ...entry.manifest, version };
	writeFileSync(
		entry.manifestPath,
		`${JSON.stringify(manifest, null, indentation)}${finalNewline}`,
	);
	console.log(`release: updated ${entry.name} to ${version}`);
}
