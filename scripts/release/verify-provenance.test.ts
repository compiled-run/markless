// verify-provenance against a fake `npm` on PATH that answers like a lagging registry.
import { spawnSync } from 'node:child_process';
import { chmod, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'vitest';
import { releasePackages, rootVersion } from './release-packages.mjs';

const verifyProvenanceCli = fileURLToPath(new URL('./verify-provenance.mjs', import.meta.url));
const version = rootVersion() as string;

type Answer = 'missing' | 'bare' | 'attested';

// Each package answers `script[n]` on its n-th lookup and the last entry after that.
async function fakeRegistry(script: Readonly<Record<string, readonly Answer[]>>) {
	const directory = await mkdtemp(join(tmpdir(), 'markless-fake-npm-'));
	const npm = join(directory, 'npm');
	await writeFile(
		npm,
		`#!/usr/bin/env node
const { readFileSync, writeFileSync, existsSync } = require('node:fs');
const script = ${JSON.stringify(script)};
const spec = process.argv[3];
const name = spec.slice(0, spec.lastIndexOf('@'));
const counts = ${JSON.stringify(join(directory, 'counts.json'))};
const seen = existsSync(counts) ? JSON.parse(readFileSync(counts, 'utf8')) : {};
const index = seen[name] ?? 0;
seen[name] = index + 1;
writeFileSync(counts, JSON.stringify(seen));
const answers = script[name] ?? ['attested'];
const answer = answers[Math.min(index, answers.length - 1)];
if (answer === 'missing') {
	process.stderr.write('npm error code E404\\nnpm error 404 No match found for version ${version}\\n');
	process.exit(1);
}
if (answer === 'bare') {
	process.stdout.write(JSON.stringify(['${version}']));
	process.exit(0);
}
process.stdout.write(JSON.stringify([{ version: '${version}', 'dist.attestations': { url: 'https://registry.example/attestations/' + name, provenance: { predicateType: 'https://slsa.dev/provenance/v1' } } }]));
`,
	);
	await chmod(npm, 0o755);
	return directory;
}

function runVerify(fakeDirectory: string, deadlineMs: number) {
	const result = spawnSync(process.execPath, [verifyProvenanceCli, '--version', version], {
		encoding: 'utf8',
		env: {
			...process.env,
			PATH: `${fakeDirectory}:${process.env.PATH ?? ''}`,
			MARKLESS_PROVENANCE_DEADLINE_MS: String(deadlineMs),
			MARKLESS_PROVENANCE_FIRST_DELAY_MS: '20',
			MARKLESS_PROVENANCE_MAX_DELAY_MS: '40',
		},
	});
	return { exitCode: result.status ?? 1, stdout: result.stdout, stderr: result.stderr };
}

const [first, second] = releasePackages().map((entry) => entry.name) as [string, string];

// Each run spawns a node process per registry read, a dozen or more that together pass 5 s on a loaded machine.
const RUN_TIMEOUT_MS = 120_000;

test('a package the registry does not show yet is waited for, not failed', async () => {
	const fake = await fakeRegistry({
		[first]: [
			'missing',
			'missing',
			'missing',
			'missing',
			'missing',
			'missing',
			'missing',
			'attested',
		],
	});
	// The eighth read answers, so the deadline only bounds a run that never would.
	const result = runVerify(fake, 60_000);
	expect(result.stderr).toBe('');
	expect(result.exitCode).toBe(0);
	expect(result.stdout).toContain(`not visible on the registry yet: ${first}@${version}`);
	expect(result.stdout).toContain(`provenance verified for every release package at ${version}`);
}, RUN_TIMEOUT_MS);

test('a package that stays invisible past the deadline fails and says so', async () => {
	const fake = await fakeRegistry({ [first]: ['missing'] });
	const result = runVerify(fake, 300);
	expect(result.exitCode).toBe(1);
	expect(result.stderr).toContain(`${first}@${version}: still not visible on the registry`);
}, RUN_TIMEOUT_MS);

test('a visible package without an attestation fails as published without provenance', async () => {
	const fake = await fakeRegistry({ [second]: ['bare'] });
	const result = runVerify(fake, 300);
	expect(result.exitCode).toBe(1);
	expect(result.stderr).toContain(`${second}@${version}: dist.attestations is empty`);
	expect(result.stderr).not.toContain(first);
}, RUN_TIMEOUT_MS);
