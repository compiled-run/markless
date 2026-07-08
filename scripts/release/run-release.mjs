// Release orchestrator: the version bump is only made durable AFTER the
// publish succeeds. bumpp edits manifests in place (no commit/tag/push);
// build + publish run against the bumped manifests; only when the publish
// fan-out succeeds do we commit, tag, push, and cut the GitHub release.
// Any failure before that point reverts the manifest edits, so a failed
// release never "keeps the version".
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const MANIFEST_PATHSPECS = ['package.json', 'packages/*/package.json'];

function run(command, args, options = {}) {
	const result = spawnSync(command, args, { stdio: 'inherit', ...options });
	if (result.error) throw result.error;
	return result.status ?? 1;
}

function rootVersion() {
	return JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf-8'))
		.version;
}

function revertManifests() {
	run('git', ['checkout', '--', ...MANIFEST_PATHSPECS]);
}

const before = rootVersion();

// 1. Bump manifests only — git untouched until the publish succeeds.
if (run('pnpm', ['exec', 'bumpp', ...MANIFEST_PATHSPECS, '--no-commit', '--no-tag', '--no-push']) !== 0) {
	revertManifests();
	console.error('release: bump cancelled or failed — versions reverted.');
	process.exit(1);
}

const version = rootVersion();
if (version === before) {
	console.error(`release: version unchanged (${before}) — nothing to do.`);
	process.exit(1);
}

// 2. Build + guarded publish against the bumped (uncommitted) manifests.
for (const [name, args] of [
	['build', ['run', 'build']],
	['publish', ['run', 'publish']],
]) {
	if (run('pnpm', args) !== 0) {
		revertManifests();
		console.error(
			`release: ${name} failed — versions reverted to ${before}. Fix the cause and run pnpm release again.`,
		);
		process.exit(1);
	}
}

// 3. Publish succeeded — NOW make the version durable.
const tag = `v${version}`;
for (const args of [
	['add', ...MANIFEST_PATHSPECS],
	['commit', '-m', `chore: release ${tag}`],
	['tag', tag],
	['push', '--follow-tags'],
]) {
	if (run('git', args) !== 0) {
		console.error(
			`release: PUBLISHED ${version} but git ${args[0]} failed — finish manually: git add/commit/tag ${tag}/push.`,
		);
		process.exit(1);
	}
}

if (run('gh', ['release', 'create', tag, '--generate-notes']) !== 0) {
	console.error(`release: published + tagged ${tag}, but gh release create failed — run it manually.`);
	process.exit(1);
}

console.log(`release: ${version} published, tagged, and released.`);
