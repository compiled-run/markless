// CI publisher for npm trusted publishing (GitHub Actions OIDC).
//
// Publishes through `pnpm --filter <name> publish`, not `npm publish <tarball>`,
// because every publishable markless package carries `workspace:` or `catalog:`
// dependency ranges and only pnpm rewrites those at pack time. pnpm then shells
// out to the `npm` binary on PATH with the process environment intact, so the
// OIDC exchange and the provenance attestation are produced by the npm CLI the
// workflow pinned. Going through `pnpm publish` also keeps each package's
// `prepublishOnly` shape guard firing, which the tarball route would skip.
//
// Fail-closed by construction: the FIRST failing package exits non-zero and
// nothing after it runs. Do not add `|| true`, `|| echo`, or a per-package
// try/catch here. Swallowing a publish failure turns a failed OIDC exchange
// into a green run, which is the exact way this whole mechanism gets shipped
// broken without anyone noticing.
//
// Resumable: a package already on the registry at this version is skipped, so a
// rerun after a partial failure finishes the release instead of erroring on
// EPUBLISHCONFLICT.
//
// Usage:
//   node scripts/release/publish-workspace.mjs --version <v> [--tag <dist-tag>] [--dry-run]
import { spawnSync } from 'node:child_process';
import process from 'node:process';
import { assertVersionLockstep, releasePackages, repoRoot } from './release-packages.mjs';

function readOption(flag) {
	const index = process.argv.indexOf(flag);
	if (index === -1) {
		return undefined;
	}
	const value = process.argv[index + 1];
	return value === undefined || value.startsWith('--') || value.trim() === ''
		? undefined
		: value.trim();
}

function fail(message) {
	console.error(`publish-workspace: ${message}`);
	process.exit(1);
}

const dryRun = process.argv.includes('--dry-run');
const requestedVersion = readOption('--version');
const distTag = readOption('--tag');

if (requestedVersion === undefined) {
	fail('--version <v> is required so CI cannot publish a ref it was not asked for');
}

let version;
try {
	version = assertVersionLockstep(requestedVersion);
} catch (error) {
	fail(error.message);
}

// A stored token here would mean the run is not proving trusted publishing at
// all. The workflow asserts this too; asserting it again keeps the guarantee
// attached to the publisher rather than to one YAML file.
//
// The one value that is NOT a credential: actions/setup-node writes an .npmrc
// containing `_authToken=${NODE_AUTH_TOKEN}` whenever it is given a
// registry-url, and exports this literal placeholder so that template resolves
// to something. npm's own recommended trusted-publishing workflow uses
// registry-url and sets no token, so the placeholder is present there too and
// the OIDC exchange still happens. Rejecting it would mean rejecting the
// documented configuration.
//
// Do not "simplify" this back to a non-empty check. That is what failed the
// first real dry run of this workflow.
const SETUP_NODE_PLACEHOLDER = 'XXXXX-XXXXX-XXXXX-XXXXX';

for (const variable of ['NODE_AUTH_TOKEN', 'NPM_TOKEN']) {
	const value = process.env[variable] ?? '';
	if (value !== '' && value !== SETUP_NODE_PLACEHOLDER) {
		fail(
			`${variable} is set to a real value. This publisher exists to prove no stored npm token is used; remove it and rely on the OIDC exchange.`,
		);
	}
}

function isPublished(name) {
	const result = spawnSync('npm', ['view', `${name}@${version}`, 'version'], {
		encoding: 'utf-8',
	});
	return result.status === 0;
}

const packages = releasePackages();
console.log(
	`publish-workspace: ${dryRun ? 'DRY RUN' : 'PUBLISH'} ${packages.length} package(s) at ${version}${
		distTag === undefined ? '' : ` with dist-tag ${distTag}`
	}`,
);
if (dryRun) {
	console.log(
		'publish-workspace: a green dry run proves packaging, version lockstep and registry reachability. It does NOT prove the OIDC exchange or provenance — those need a real publish.',
	);
}

let published = 0;
let skipped = 0;

for (const entry of packages) {
	if (!dryRun && isPublished(entry.name)) {
		console.log(`publish-workspace: ${entry.name}@${version} already on the registry — skipping.`);
		skipped += 1;
		continue;
	}

	const args = ['--filter', entry.name, 'publish', '--access', 'public', '--no-git-checks'];
	if (distTag !== undefined) {
		args.push('--tag', distTag);
	}
	if (dryRun) {
		// --force ONLY here, and only alongside --dry-run. Without it pnpm
		// short-circuits with "there are no new packages that should be
		// published" whenever the version is already on the registry, so the
		// dry run would pack nothing, run no prepublishOnly guard, and still go
		// green. --dry-run is what keeps this off the registry; --force only
		// stops the check from being skipped. Never add --force to the real
		// publish path: there it would overwrite the resumability skip above.
		args.push('--dry-run', '--force');
	}

	console.log(`publish-workspace: pnpm ${args.join(' ')}`);
	const result = spawnSync('pnpm', args, { stdio: 'inherit', cwd: repoRoot });
	if (result.error) {
		fail(`${entry.name}@${version} could not be spawned: ${result.error.message}`);
	}
	if (result.status !== 0) {
		fail(
			`${entry.name}@${version} failed with exit code ${result.status}. Stopping here: ${published} package(s) published, ${packages.length - published - skipped - 1} not attempted. Already-published packages stay published; rerunning resumes ${version}.`,
		);
	}
	published += 1;
}

console.log(
	`publish-workspace: done — ${published} ${dryRun ? 'packed' : 'published'}, ${skipped} skipped, at ${version}.`,
);
