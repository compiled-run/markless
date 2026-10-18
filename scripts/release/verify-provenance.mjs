// Post-publish oracle. The failure this exists to catch is the quiet one: the
// packages publish fine, the workflow goes green, and npm attached no
// provenance attestation at all — so nothing about trusted publishing was
// actually proven. Reading the registry back and failing the run turns that
// from an invisible outcome into a red build.
//
// Checks EVERY release package, not one sample. A half-provenanced release
// looks identical to a good one if you only check @markless/core.
//
// Usage: node scripts/release/verify-provenance.mjs --version <v>
import { spawnSync } from 'node:child_process';
import process from 'node:process';
import { assertVersionLockstep, releasePackages } from './release-packages.mjs';

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

const requestedVersion = readOption('--version');
if (requestedVersion === undefined) {
	console.error('verify-provenance: --version <v> is required');
	process.exit(1);
}

let version;
try {
	version = assertVersionLockstep(requestedVersion);
} catch (error) {
	console.error(`verify-provenance: ${error.message}`);
	process.exit(1);
}

// The registry's read replicas lag its write path: on 0.2.0 a package read back 4 s after
// publishing returned E404, and on 0.5.0 six reads 5 s apart were not enough. A package that
// is not visible yet, or visible without its attestation yet, is waited for until one shared
// deadline; only what is still missing then counts as a failure.
const DEADLINE_MS = Number(process.env.MARKLESS_PROVENANCE_DEADLINE_MS ?? 180_000);
const FIRST_DELAY_MS = Number(process.env.MARKLESS_PROVENANCE_FIRST_DELAY_MS ?? 5_000);
const MAX_DELAY_MS = Number(process.env.MARKLESS_PROVENANCE_MAX_DELAY_MS ?? 30_000);

function sleep(ms) {
	Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

/** One registry read: `attested`, `bare` (visible, no attestation), `missing`, or `error`. */
function readPackage(name) {
	const result = spawnSync(
		'npm',
		['view', `${name}@${version}`, 'version', 'dist.attestations', '--json'],
		{ encoding: 'utf-8' },
	);
	const stdout = (result.stdout ?? '').trim();
	const stderr = (result.stderr ?? '').trim();
	if (result.status !== 0) {
		const notFound = /E404|No match found|could not be found/u.test(`${stderr}\n${stdout}`);
		return { state: notFound ? 'missing' : 'error', detail: stderr || stdout || 'no output' };
	}
	let parsed;
	try {
		parsed = stdout === '' ? undefined : JSON.parse(stdout);
	} catch {
		return { state: 'error', detail: `unparseable output: ${stdout}` };
	}
	const view = Array.isArray(parsed) ? parsed.at(-1) : parsed;
	if (view === undefined) return { state: 'missing', detail: 'empty output' };
	const attestations =
		view !== null && typeof view === 'object' ? view['dist.attestations'] : undefined;
	if (
		attestations === undefined ||
		attestations === null ||
		typeof attestations !== 'object' ||
		Object.keys(attestations).length === 0
	) {
		return { state: 'bare', detail: '' };
	}
	return { state: 'attested', detail: JSON.stringify(attestations) };
}

const started = Date.now();
const pending = new Map(releasePackages().map((entry) => [entry.name, undefined]));
let delay = FIRST_DELAY_MS;

for (;;) {
	for (const name of pending.keys()) {
		const read = readPackage(name);
		if (read.state === 'attested') {
			console.log(`  provenance ok: ${name}@${version} -> ${read.detail}`);
			pending.delete(name);
		} else {
			pending.set(name, read);
		}
	}
	if (pending.size === 0) break;
	const elapsed = Date.now() - started;
	if (elapsed >= DEADLINE_MS) break;
	for (const [name, read] of pending) {
		const why =
			read.state === 'missing'
				? 'not visible on the registry yet'
				: read.state === 'bare'
					? 'visible, attestation not visible yet'
					: `registry read failed (${read.detail})`;
		console.log(`  ${why}: ${name}@${version}`);
	}
	const wait = Math.min(delay, DEADLINE_MS - elapsed);
	console.log(
		`  waiting ${(wait / 1000).toFixed(1)} s for the registry (${Math.round(elapsed / 1000)} of ${Math.round(DEADLINE_MS / 1000)} s used)`,
	);
	sleep(wait);
	delay = Math.min(delay * 2, MAX_DELAY_MS);
}

const waited = `after ${Math.round((Date.now() - started) / 1000)} s`;
const failures = [...pending].map(([name, read]) =>
	read.state === 'bare'
		? `${name}@${version}: dist.attestations is empty ${waited} — published WITHOUT provenance, so this publish did not go through trusted publishing`
		: read.state === 'missing'
			? `${name}@${version}: still not visible on the registry ${waited} — ${read.detail}`
			: `${name}@${version}: npm view failed ${waited} — ${read.detail}`,
);

if (failures.length > 0) {
	console.error('\nrelease failed its own oracle: provenance is missing\n');
	for (const failure of failures) {
		console.error(`  - ${failure}`);
	}
	process.exit(1);
}

console.log(`\nprovenance verified for every release package at ${version}`);
