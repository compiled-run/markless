// Fail-closed publish guard. Wired as `prepublishOnly` in every release
// package, so `pnpm publish` aborts unless the packed dist output matches the
// published exports surface. Run with `--all` from the repo root to check the
// whole release set (the `pnpm release` flow does this after `vp pack`).
//
// The release set is derived from packages/*/package.json by
// release-packages.mjs. It used to be an eight-name literal here, which had
// silently stopped covering @markless/analyzer and @markless/typescript-plugin.
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';
import { releasePackages } from './release-packages.mjs';

// Every string leaf under an exports target, whatever conditions wrap it.
// Reading only `types`/`default` skipped `require` entries, so a CommonJS
// export could point at a file no build produced and still pass this guard.
function targetPaths(target) {
	if (typeof target === 'string') {
		return [target];
	}
	if (Array.isArray(target)) {
		return target.flatMap(targetPaths);
	}
	if (target !== null && typeof target === 'object') {
		return Object.values(target).flatMap(targetPaths);
	}
	return [];
}

// Expands `*` in a published target against the dev exports source glob so
// every real module behind a glob subpath is checked individually.
function expandPublishedTargets(packageDir, subpath, sourceTarget, publishedTarget) {
	const published = targetPaths(publishedTarget);
	if (!subpath.includes('*')) {
		return published;
	}
	const sourcePattern = targetPaths(sourceTarget ?? {})[0];
	if (sourcePattern === undefined || !sourcePattern.includes('*')) {
		return published;
	}
	const [sourceDirPart] = sourcePattern.split('*');
	const sourceDir = resolve(packageDir, sourceDirPart ?? '');
	const stems = readdirSync(sourceDir)
		.filter((file) => file.endsWith('.ts'))
		.map((file) => file.slice(0, -'.ts'.length));
	return stems.flatMap((stem) => published.map((path) => path.replaceAll('*', stem)));
}

function verifyPackage(packageDir) {
	const failures = [];
	const manifestPath = resolve(packageDir, 'package.json');
	const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
	const label = manifest.name ?? packageDir;

	if (manifest.private === true) {
		failures.push(`${label}: still private`);
	}
	if (manifest.version === undefined || manifest.version === '0.0.0') {
		failures.push(`${label}: version is ${manifest.version ?? 'missing'}`);
	}
	if (manifest.publishConfig?.access !== 'public') {
		failures.push(`${label}: publishConfig.access must be "public"`);
	}
	// Provenance is a package-owned fact, declared once per manifest. The
	// release workflow must not set NPM_CONFIG_PROVENANCE=true instead; that
	// would be a second copy of it that can drift.
	if (manifest.publishConfig?.provenance !== true) {
		failures.push(`${label}: publishConfig.provenance must be true (npm provenance attestation)`);
	}
	// npm refuses to attest a package whose manifest names a different
	// repository than the one publishing it.
	if (typeof manifest.repository?.url !== 'string') {
		failures.push(`${label}: repository.url is required for npm provenance`);
	}
	if (!Array.isArray(manifest.files) || !manifest.files.includes('dist')) {
		failures.push(`${label}: files must include "dist"`);
	}
	if (manifest.files?.includes('src')) {
		failures.push(`${label}: files must not ship TypeScript source`);
	}

	const devExports = manifest.exports ?? {};
	const publishedExports = manifest.publishConfig?.exports;
	if (publishedExports === undefined) {
		failures.push(`${label}: publishConfig.exports missing (would publish src exports)`);
	} else {
		for (const subpath of Object.keys(devExports)) {
			if (publishedExports[subpath] === undefined) {
				failures.push(`${label}: subpath ${subpath} missing from publishConfig.exports`);
			}
		}
		for (const [subpath, target] of Object.entries(publishedExports)) {
			for (const path of expandPublishedTargets(
				packageDir,
				subpath,
				devExports[subpath],
				target,
			)) {
				if (!path.startsWith('./dist/')) {
					failures.push(`${label}: ${subpath} -> ${path} must target ./dist`);
				} else if (!existsSync(resolve(packageDir, path))) {
					failures.push(`${label}: ${subpath} -> ${path} missing on disk (run vp pack)`);
				}
			}
		}
	}

	// App-context vite-plugin entries (router): served as source .ts compiled in
	// the CONSUMER app's module graph. When a package carries them, the tarball
	// must ship the directory and no entry may import relatively (a ../.. path
	// escapes the shipped directory into unpublished src/ — the 0.1.0 defect).
	const appEntriesDir = resolve(packageDir, 'src/vite/entries');
	if (existsSync(appEntriesDir)) {
		if (!manifest.files?.includes('src/vite/entries')) {
			failures.push(`${label}: files must ship "src/vite/entries" (vite-plugin app entries)`);
		}
		for (const fileName of readdirSync(appEntriesDir)) {
			if (!fileName.endsWith('.ts')) continue;
			const code = readFileSync(resolve(appEntriesDir, fileName), 'utf8');
			for (const match of code.matchAll(/(?:from\s*|^import\s*|\bimport\()\s*['"]([^'"]+)['"]/gm)) {
				if (match[1]?.startsWith('.')) {
					failures.push(
						`${label}: src/vite/entries/${fileName} imports '${match[1]}' relatively — unresolvable from the published tarball`,
					);
				}
			}
		}
	}

	for (const [binName, binPath] of Object.entries(manifest.publishConfig?.bin ?? {})) {
		if (!existsSync(resolve(packageDir, binPath))) {
			failures.push(`${label}: bin ${binName} -> ${binPath} missing on disk (run vp pack)`);
		}
	}
	if (manifest.bin !== undefined && manifest.publishConfig?.bin === undefined) {
		failures.push(`${label}: bin points at source but publishConfig.bin is missing`);
	}

	// pnpm rewrites workspace: ranges at pack time; anything else pointing at a
	// workspace package would leak an uninstallable specifier into the tarball.
	for (const [dependency, range] of Object.entries(manifest.dependencies ?? {})) {
		if (dependency.startsWith('@markless/') && !range.startsWith('workspace:')) {
			failures.push(
				`${label}: ${dependency}@${range} must use the workspace: protocol so pnpm rewrites it`,
			);
		}
		if (range.startsWith('file:') || range.startsWith('link:')) {
			failures.push(`${label}: ${dependency}@${range} would not resolve for consumers`);
		}
	}

	return failures;
}

const packageDirs = process.argv.includes('--all')
	? releasePackages().map((entry) => entry.packageDir)
	: [process.cwd()];

const failures = packageDirs.flatMap((packageDir) => verifyPackage(packageDir));

if (failures.length > 0) {
	console.error('publish blocked: package is not publish-ready\n');
	for (const failure of failures) {
		console.error(`  - ${failure}`);
	}
	process.exit(1);
}

console.log(`publish-ready: ${packageDirs.length} package(s) verified`);
