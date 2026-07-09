// Release orchestrator, resumable and fail-safe:
// - If the current version is NOT fully on the registry, `pnpm release`
//   RESUMES it: no bump prompt, already-published packages are skipped,
//   missing ones publish, git/tag/release finalize idempotently.
// - If the current version is fully published, bumpp picks the next one —
//   but the bump is only made durable (commit/tag/push/gh release) AFTER
//   the publish succeeds. Failures before that revert the manifests, so a
//   failed release never keeps the version.
import { spawnSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';

const MANIFEST_PATHSPECS = ['package.json', 'packages/*/package.json'];

function run(command, args, options = {}) {
	const result = spawnSync(command, args, { stdio: 'inherit', ...options });
	if (result.error) throw result.error;
	return result.status ?? 1;
}

function capture(command, args) {
	const result = spawnSync(command, args, { encoding: 'utf-8' });
	return { status: result.status ?? 1, stdout: (result.stdout ?? '').trim() };
}

function rootVersion() {
	return JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf-8'))
		.version;
}

function releasePackageNames() {
	return readdirSync(new URL('../../packages', import.meta.url))
		.map((dir) => {
			try {
				return JSON.parse(
					readFileSync(new URL(`../../packages/${dir}/package.json`, import.meta.url), 'utf-8'),
				);
			} catch {
				return null;
			}
		})
		.filter((manifest) => manifest !== null && manifest.private !== true)
		.map((manifest) => manifest.name);
}

function isPublished(name, version) {
	return capture('npm', ['view', `${name}@${version}`, 'version']).status === 0;
}

function revertManifests() {
	run('git', ['checkout', '--', ...MANIFEST_PATHSPECS]);
}

function fail(message) {
	console.error(`release: ${message}`);
	process.exit(1);
}

const packages = releasePackageNames();
const current = rootVersion();
const missingAtCurrent = packages.filter((name) => !isPublished(name, current));

let version = current;
if (missingAtCurrent.length === 0) {
	// Fully published — pick the next version. Manifests only; git untouched.
	if (
		run('pnpm', [
			'exec',
			'bumpp',
			...MANIFEST_PATHSPECS,
			'--no-commit',
			'--no-tag',
			'--no-push',
		]) !== 0
	) {
		revertManifests();
		fail('bump cancelled or failed — versions reverted.');
	}
	version = rootVersion();
	if (version === current) {
		revertManifests();
		fail(`version unchanged (${current}) and ${current} is already fully published.`);
	}
} else {
	console.log(
		`release: ${current} is not fully on the registry (${missingAtCurrent.length}/${packages.length} packages missing) — resuming the ${current} release, no bump.`,
	);
}

if (run('pnpm', ['run', 'build']) !== 0) {
	revertManifests();
	fail(`build failed — versions reverted. Fix the cause and run pnpm release again.`);
}

// Publish each not-yet-published package; skipping makes retries safe.
for (const name of packages) {
	if (isPublished(name, version)) {
		console.log(`release: ${name}@${version} already published — skipping.`);
		continue;
	}
	if (
		run('pnpm', ['--filter', name, 'publish', '--access', 'public', '--no-git-checks']) !== 0
	) {
		revertManifests();
		fail(
			`publishing ${name}@${version} failed — versions reverted (already-published packages stay published; rerunning pnpm release resumes ${version}).`,
		);
	}
}

// Publish succeeded — finalize git idempotently (safe on resume reruns).
const tag = `v${version}`;
if (capture('git', ['status', '--porcelain', '--', ...MANIFEST_PATHSPECS]).stdout !== '') {
	if (run('git', ['add', ...MANIFEST_PATHSPECS]) !== 0 || run('git', ['commit', '-m', `chore: release ${tag}`]) !== 0)
		fail(`PUBLISHED ${version} but the release commit failed — finish manually (add/commit/tag ${tag}/push).`);
}
if (capture('git', ['rev-parse', '-q', '--verify', `refs/tags/${tag}`]).status !== 0) {
	// Annotated, not lightweight: --follow-tags only pushes annotated tags.
	if (run('git', ['tag', '-a', tag, '-m', `chore: release ${tag}`]) !== 0)
		fail(`PUBLISHED ${version} but tagging failed — tag ${tag} manually.`);
}
if (run('git', ['push', '--follow-tags']) !== 0)
	fail(`PUBLISHED ${version} but push failed — push --follow-tags manually.`);
// Belt and braces: pre-existing lightweight tags are not covered by --follow-tags.
if (run('git', ['push', 'origin', tag]) !== 0)
	fail(`PUBLISHED ${version} but pushing tag ${tag} failed — push it manually.`);
if (capture('gh', ['release', 'view', tag]).status !== 0) {
	if (run('gh', ['release', 'create', tag, '--generate-notes']) !== 0)
		fail(`published + tagged ${tag}, but gh release create failed — run it manually.`);
}

console.log(`release: ${version} published, tagged, and released.`);
