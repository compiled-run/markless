// Proves the tarballs a release would upload are actually publishable, by
// packing them for real and reading what came out. Manifest inspection is not
// enough: every publishable markless package declares `workspace:` and
// `catalog:` dependency ranges that only exist inside this repo, and the whole
// publish mechanism rests on pnpm rewriting them to real versions at pack time.
// If that ever stops being true, consumers get an uninstallable package and the
// repo's own `package.json` files still look perfect.
//
// Checked per tarball:
//   1. no surviving workspace:/catalog:/file:/link: range in any dependency
//      field (the rewrite actually happened)
//   2. publishConfig.provenance === true (survived packing, so npm will attach
//      a provenance attestation on a trusted publish)
//   3. publishConfig.access === 'public'
//   4. repository.url matches `git remote get-url origin`, and every package
//      agrees on it — npm provenance rejects a manifest that claims a different
//      repository than the one publishing
//   5. every `exports` and `bin` target points under ./dist and is really in
//      the tarball (a published export that resolves to a missing file is a
//      broken install that no local build catches)
//
// Scope is derived: every packages/* manifest carrying `publishConfig`. That
// includes packages deliberately still `private` (@markless/vitest-browser), so
// their packaging is proven before the flag is ever flipped.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import process from 'node:process';
import { preparedPackages, repoRoot } from './release-packages.mjs';

const DEPENDENCY_FIELDS = [
	'dependencies',
	'devDependencies',
	'peerDependencies',
	'optionalDependencies',
];
const WORKSPACE_ONLY_RANGE = /^(workspace:|catalog:|file:|link:)/;

function run(command, args, options = {}) {
	const result = spawnSync(command, args, { encoding: 'utf-8', ...options });
	if (result.error) {
		throw result.error;
	}
	return {
		status: result.status ?? 1,
		stdout: (result.stdout ?? '').trim(),
		stderr: (result.stderr ?? '').trim(),
	};
}

// git@github.com:org/repo.git and git+https://github.com/org/repo.git are the
// same repository; npm compares them as the same repository too.
function normalizeRepositoryUrl(url) {
	return url
		.replace(/^git\+/, '')
		.replace(/^ssh:\/\//, '')
		.replace(/^https?:\/\//, '')
		.replace(/^git@/, '')
		.replace(/^([^/:]+):/, '$1/')
		.replace(/\.git$/, '')
		.replace(/\/+$/, '')
		.toLowerCase();
}

/** Every string leaf of an exports subtree, whatever conditions wrap it. */
function exportTargets(target) {
	if (typeof target === 'string') {
		return [target];
	}
	if (Array.isArray(target)) {
		return target.flatMap(exportTargets);
	}
	if (target !== null && typeof target === 'object') {
		return Object.values(target).flatMap(exportTargets);
	}
	return [];
}

function listFiles(dir, prefix = '') {
	return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
		const nested = prefix === '' ? entry.name : `${prefix}/${entry.name}`;
		return entry.isDirectory() ? listFiles(join(dir, entry.name), nested) : [nested];
	});
}

function globMatches(pattern, files) {
	const source = pattern
		.replace(/^\.\//, '')
		.split('*')
		.map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
		.join('[^/]+');
	const matcher = new RegExp(`^${source}$`);
	return files.some((file) => matcher.test(file));
}

const origin = run('git', ['remote', 'get-url', 'origin'], { cwd: repoRoot });
if (origin.status !== 0 || origin.stdout === '') {
	console.error('verify-packed-manifests: could not read `git remote get-url origin`');
	process.exit(1);
}
const expectedRepository = normalizeRepositoryUrl(origin.stdout);

const workDir = mkdtempSync(join(tmpdir(), 'markless-packed-manifests-'));
const failures = [];
const seenRepositories = new Set();
const packages = preparedPackages();

console.log(
	`verify-packed-manifests: packing ${packages.length} package(s) into ${workDir}\n` +
		`  expected repository: ${expectedRepository}`,
);

try {
	for (const entry of packages) {
		const label = entry.name;
		const packDir = join(workDir, entry.dir);
		const extractDir = join(packDir, 'extracted');
		mkdirSync(extractDir, { recursive: true });

		const packed = run('pnpm', ['--filter', entry.name, 'pack', '--pack-destination', packDir], {
			cwd: repoRoot,
		});
		if (packed.status !== 0) {
			failures.push(`${label}: pnpm pack failed\n${packed.stderr || packed.stdout}`);
			continue;
		}
		const tarballs = readdirSync(packDir).filter((file) => file.endsWith('.tgz'));
		if (tarballs.length !== 1) {
			failures.push(`${label}: expected exactly one tarball, found ${tarballs.length}`);
			continue;
		}
		const extracted = run('tar', ['-xzf', join(packDir, tarballs[0]), '-C', extractDir]);
		if (extracted.status !== 0) {
			failures.push(`${label}: could not extract ${tarballs[0]}\n${extracted.stderr}`);
			continue;
		}

		const packageRoot = join(extractDir, 'package');
		const manifest = JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf8'));
		const files = listFiles(packageRoot);

		for (const field of DEPENDENCY_FIELDS) {
			for (const [dependency, range] of Object.entries(manifest[field] ?? {})) {
				if (typeof range === 'string' && WORKSPACE_ONLY_RANGE.test(range)) {
					failures.push(
						`${label}: ${field}.${dependency} is still "${range}" in the tarball — that range only resolves inside this repo, so the published package would be uninstallable`,
					);
				}
			}
		}

		if (manifest.publishConfig?.provenance !== true) {
			failures.push(
				`${label}: publishConfig.provenance must survive into the tarball as true (found ${JSON.stringify(manifest.publishConfig?.provenance)}) — it is what makes npm attach a provenance attestation`,
			);
		}
		if (manifest.publishConfig?.access !== 'public') {
			failures.push(
				`${label}: publishConfig.access must be "public" in the tarball (found ${JSON.stringify(manifest.publishConfig?.access)})`,
			);
		}

		const repositoryUrl = manifest.repository?.url;
		if (typeof repositoryUrl !== 'string') {
			failures.push(`${label}: repository.url is missing — npm provenance requires it`);
		} else {
			seenRepositories.add(normalizeRepositoryUrl(repositoryUrl));
			if (normalizeRepositoryUrl(repositoryUrl) !== expectedRepository) {
				failures.push(
					`${label}: repository.url ${repositoryUrl} does not match the publishing repository ${expectedRepository}`,
				);
			}
		}
		if (manifest.repository?.directory !== entry.directory) {
			failures.push(
				`${label}: repository.directory must be "${entry.directory}" (found ${JSON.stringify(manifest.repository?.directory)})`,
			);
		}

		const targets = [
			...Object.entries(manifest.exports ?? {}).flatMap(([subpath, target]) =>
				exportTargets(target).map((path) => [`exports["${subpath}"]`, path]),
			),
			...Object.entries(manifest.bin ?? {}).map(([binName, path]) => [`bin.${binName}`, path]),
		];
		// A source-shipped package's exports live under src by design.
		const shipsSource = manifest.publishConfig?.marklessShipsSource === true ||
			(manifest.marklessShipsSource === true);
		const requiredPrefix = shipsSource ? './src/' : './dist/';
		for (const [where, path] of targets) {
			const isShippedData = shipsSource && path.endsWith('.json');
			if (!path.startsWith(requiredPrefix) && !isShippedData) {
				failures.push(`${label}: ${where} -> ${path} must target ${requiredPrefix.slice(0, -1)}`);
				continue;
			}
			const relativePath = path.slice('./'.length);
			const present = path.includes('*')
				? globMatches(relativePath, files)
				: existsSync(join(packageRoot, relativePath));
			if (!present) {
				failures.push(
					`${label}: ${where} -> ${path} is not in the tarball — consumers would get an unresolvable import`,
				);
			}
		}

		console.log(`  ok packed: ${label} (${files.length} files)`);
	}

	if (seenRepositories.size > 1) {
		failures.push(
			`packages disagree on repository.url: ${[...seenRepositories].join(', ')} — provenance is per-repository, so they must all name one`,
		);
	}
} finally {
	rmSync(workDir, { recursive: true, force: true });
}

if (failures.length > 0) {
	console.error('\npublish blocked: packed tarballs are not publishable\n');
	for (const failure of failures) {
		console.error(`  - ${failure}`);
	}
	console.error('\nIf a dist target is missing, run `pnpm build` and try again.');
	process.exit(1);
}

console.log(`\npacked manifests verified: ${packages.length} tarball(s)`);
