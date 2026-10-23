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
// EPUBLISHCONFLICT. A package npm took but is still processing (E409 "previously
// staged version") is not published again; the run waits, bounded, until npm shows it.
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

// npm answers a large upload with "Your package is being processed" and shows it only once
// processing ends: @markless/core@0.6.0 and @markless/compiler@0.7.0 took 13 to 14 minutes.
const REGISTRY_DEADLINE_MS = Number(process.env.MARKLESS_REGISTRY_DEADLINE_MS ?? 1_200_000);
const REGISTRY_FIRST_DELAY_MS = Number(process.env.MARKLESS_REGISTRY_FIRST_DELAY_MS ?? 5_000);
const REGISTRY_MAX_DELAY_MS = Number(process.env.MARKLESS_REGISTRY_MAX_DELAY_MS ?? 30_000);

function sleep(ms) {
	Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function isPublished(name) {
	const result = spawnSync('npm', ['view', `${name}@${version}`, 'version'], {
		encoding: 'utf-8',
	});
	return result.status === 0;
}

// Attempts per package for an answer that says nothing about the package: on 0.9.0 npm answered
// E401 "token is invalid", E503 and E404 on PUT between packages the same trusted publisher published.
const PUBLISH_ATTEMPTS = 4;
const PUBLISH_RETRY_DELAY_MS = Number(process.env.MARKLESS_PUBLISH_RETRY_DELAY_MS ?? 15_000);

/** What one `pnpm publish` attempt's exit status and output say happened on the registry. */
function publishOutcome(status, output) {
	if (status === 0) return 'published';
	if (/\bE409\b/u.test(output) && /previously staged version/iu.test(output)) return 'staged';
	if (/\bE403\b/u.test(output) && /cannot publish over the previously published/iu.test(output))
		return 'exists';
	// npm answers a PUT whose OIDC exchange it did not accept with E401, or with E404 on a package that exists.
	if (/\bE401\b/u.test(output) || /\b404 Not Found - PUT\b/u.test(output)) return 'unauthorized';
	if (/\bE(?:429|502|503|504)\b/u.test(output)) return 'unavailable';
	return 'failed';
}

function publishOnce(entry, args) {
	console.log(`publish-workspace: pnpm ${args.join(' ')}`);
	const result = spawnSync('pnpm', args, {
		cwd: repoRoot,
		encoding: 'utf-8',
		stdio: ['inherit', 'pipe', 'pipe'],
	});
	if (result.error) {
		fail(`${entry.name}@${version} could not be spawned: ${result.error.message}`);
	}
	process.stdout.write(result.stdout ?? '');
	process.stderr.write(result.stderr ?? '');
	return {
		status: result.status,
		outcome: publishOutcome(result.status, `${result.stdout ?? ''}\n${result.stderr ?? ''}`),
	};
}

/** Packages npm took but does not show yet, waited for until one shared deadline. */
function waitUntilVisible(names) {
	const started = Date.now();
	const pending = new Set(names);
	let delay = REGISTRY_FIRST_DELAY_MS;
	for (;;) {
		for (const name of pending) {
			if (isPublished(name)) {
				console.log(
					`publish-workspace: ${name}@${version} is now visible on the registry.`,
				);
				pending.delete(name);
			}
		}
		const elapsed = Date.now() - started;
		if (pending.size === 0 || elapsed >= REGISTRY_DEADLINE_MS) return [...pending];
		const wait = Math.min(delay, REGISTRY_DEADLINE_MS - elapsed);
		console.log(
			`publish-workspace: waiting ${(wait / 1000).toFixed(1)} s for npm to finish processing ${[...pending].join(', ')} (${Math.round(elapsed / 1000)} of ${Math.round(REGISTRY_DEADLINE_MS / 1000)} s used)`,
		);
		sleep(wait);
		delay = Math.min(delay * 2, REGISTRY_MAX_DELAY_MS);
	}
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
const processing = [];

for (const entry of packages) {
	if (!dryRun && isPublished(entry.name)) {
		console.log(
			`publish-workspace: ${entry.name}@${version} already on the registry — skipping.`,
		);
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

	let attempt = publishOnce(entry, args);
	// Each npm run mints a new GitHub OIDC token and trades it again, so a retry is a fresh
	// exchange; a real trust misconfiguration fails every attempt and stops the run.
	for (
		let number = 2, delay = PUBLISH_RETRY_DELAY_MS;
		!dryRun &&
		number <= PUBLISH_ATTEMPTS &&
		['unauthorized', 'unavailable'].includes(attempt.outcome);
		number += 1, delay *= 2
	) {
		console.log(
			`publish-workspace: ${entry.name}@${version} got ${attempt.outcome === 'unauthorized' ? 'E401 or E404' : 'a busy or unavailable answer'} from the registry; retrying in ${(delay / 1000).toFixed(0)} s with a fresh OIDC exchange (attempt ${number} of ${PUBLISH_ATTEMPTS}).`,
		);
		sleep(delay);
		if (isPublished(entry.name)) {
			attempt = { status: 0, outcome: 'published' };
			console.log(
				`publish-workspace: ${entry.name}@${version} reached the registry after all.`,
			);
			break;
		}
		attempt = publishOnce(entry, args);
	}
	if (!dryRun && (attempt.outcome === 'staged' || attempt.outcome === 'exists')) {
		console.log(
			`publish-workspace: ${entry.name}@${version} is already uploaded and npm is still processing it — not publishing it again.`,
		);
		processing.push(entry.name);
		skipped += 1;
		continue;
	}
	if (attempt.status !== 0) {
		fail(
			`${entry.name}@${version} failed with exit code ${attempt.status}. Stopping here: ${published} package(s) published, ${packages.length - published - skipped - 1} not attempted. Already-published packages stay published; rerunning resumes ${version}.`,
		);
	}
	published += 1;
}

const stillProcessing = processing.length === 0 ? [] : waitUntilVisible(processing);
if (stillProcessing.length > 0) {
	fail(
		`npm took ${stillProcessing.join(', ')} at ${version} but still does not show ${stillProcessing.length === 1 ? 'it' : 'them'} after ${Math.round(REGISTRY_DEADLINE_MS / 1000)} s. Nothing is lost: rerun the release once npm shows ${stillProcessing.length === 1 ? 'it' : 'them'}, and the rerun skips ${stillProcessing.length === 1 ? 'it' : 'them'}.`,
	);
}

console.log(
	`publish-workspace: done — ${published} ${dryRun ? 'packed' : 'published'}, ${skipped} skipped, at ${version}.`,
);
