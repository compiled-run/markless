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

const failures = [];

for (const entry of releasePackages()) {
	const result = spawnSync('npm', ['view', `${entry.name}@${version}`, 'dist.attestations', '--json'], {
		encoding: 'utf-8',
	});
	const raw = (result.stdout ?? '').trim();
	if (result.status !== 0) {
		failures.push(
			`${entry.name}@${version}: npm view failed — ${(result.stderr ?? '').trim() || 'no output'}`,
		);
		continue;
	}
	let attestations;
	try {
		attestations = raw === '' ? undefined : JSON.parse(raw);
	} catch {
		failures.push(`${entry.name}@${version}: npm view returned unparseable output: ${raw}`);
		continue;
	}
	if (
		attestations === undefined ||
		attestations === null ||
		typeof attestations !== 'object' ||
		Object.keys(attestations).length === 0
	) {
		failures.push(
			`${entry.name}@${version}: dist.attestations is empty — published WITHOUT provenance, so this publish did not go through trusted publishing`,
		);
		continue;
	}
	console.log(`  provenance ok: ${entry.name}@${version} -> ${JSON.stringify(attestations)}`);
}

if (failures.length > 0) {
	console.error('\nrelease failed its own oracle: provenance is missing\n');
	for (const failure of failures) {
		console.error(`  - ${failure}`);
	}
	process.exit(1);
}

console.log(`\nprovenance verified for every release package at ${version}`);
