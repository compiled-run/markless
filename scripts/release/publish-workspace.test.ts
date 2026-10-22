// publish-workspace against a fake `pnpm` and `npm` on PATH that answer like the registry did on 0.6.0 and 0.7.0.
import { spawnSync } from 'node:child_process';
import { chmod, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'vitest';
import { releasePackages, rootVersion } from './release-packages.mjs';

const publishCli = fileURLToPath(new URL('./publish-workspace.mjs', import.meta.url));
const version = rootVersion() as string;

type Upload =
	| 'ok'
	| 'staged'
	| 'unauthorized'
	| 'notFound'
	| 'unavailable'
	| 'tooMany'
	| 'exists'
	| 'broken';
type View = 'missing' | 'visible';
type Script = { readonly upload?: readonly Upload[]; readonly view?: readonly View[] };

const uploadAnswers: Record<Upload, { readonly status: number; readonly stderr: string }> = {
	ok: {
		status: 0,
		stderr: 'npm notice Your package is being processed and may take a few minutes to become available.\n',
	},
	staged: {
		status: 1,
		stderr: `npm error code E409\nnpm error 409 Conflict - PUT https://registry.npmjs.org/NAME - Cannot publish over previously staged version "${version}".\n`,
	},
	unauthorized: {
		status: 1,
		stderr: 'npm error code E401\nnpm error 401 Unauthorized - PUT https://registry.npmjs.org/NAME - Failed to generate Web Auth URLs due to error: BadRequestError: token is invalid\n',
	},
	notFound: {
		status: 1,
		stderr: "npm error code E404\nnpm error 404 Not Found - PUT https://registry.npmjs.org/NAME - Not found\nnpm error 404  The requested resource 'NAME' could not be found or you do not have permission to access it.\n",
	},
	unavailable: {
		status: 1,
		stderr: 'npm error code E503\nnpm error 503 Service Unavailable - PUT https://registry.npmjs.org/NAME - Service Unavailable\n',
	},
	tooMany: {
		status: 1,
		stderr: 'npm error code E429\nnpm error 429 Too Many Requests - PUT https://registry.npmjs.org/NAME\n',
	},
	exists: {
		status: 1,
		stderr: `npm error code E403\nnpm error 403 403 Forbidden - PUT https://registry.npmjs.org/NAME - You cannot publish over the previously published versions: ${version}.\n`,
	},
	broken: {
		status: 1,
		stderr: 'npm error code E500\nnpm error 500 Internal Server Error - PUT https://registry.npmjs.org/NAME\n',
	},
};

// Each package answers `script[n]` on its n-th upload or view and the last entry after that.
async function fakeTools(scripts: Readonly<Record<string, Script>>) {
	const directory = await mkdtemp(join(tmpdir(), 'markless-fake-publish-'));
	const shared = `const { appendFileSync, existsSync, readFileSync, writeFileSync } = require('node:fs');
const scripts = ${JSON.stringify(scripts)};
const counts = ${JSON.stringify(join(directory, 'counts.json'))};
function answer(kind, name, fallback) {
	const seen = existsSync(counts) ? JSON.parse(readFileSync(counts, 'utf8')) : {};
	const key = kind + ' ' + name;
	const index = seen[key] ?? 0;
	seen[key] = index + 1;
	writeFileSync(counts, JSON.stringify(seen));
	appendFileSync(${JSON.stringify(join(directory, 'calls.log'))}, key + '\\n');
	const answers = scripts[name]?.[kind] ?? [fallback];
	return answers[Math.min(index, answers.length - 1)];
}
`;
	const pnpm = join(directory, 'pnpm');
	await writeFile(
		pnpm,
		`#!/usr/bin/env node
${shared}
const name = process.argv[3];
const answers = ${JSON.stringify(uploadAnswers)};
const reply = answers[answer('upload', name, 'ok')];
process.stderr.write(reply.stderr.replace('NAME', name));
process.exit(reply.status);
`,
	);
	const npm = join(directory, 'npm');
	await writeFile(
		npm,
		`#!/usr/bin/env node
${shared}
const spec = process.argv[3];
const name = spec.slice(0, spec.lastIndexOf('@'));
if (answer('view', name, 'missing') === 'visible') {
	process.stdout.write('${version}\\n');
	process.exit(0);
}
process.stderr.write('npm error code E404\\nnpm error 404 No match found for version ${version}\\n');
process.exit(1);
`,
	);
	await chmod(pnpm, 0o755);
	await chmod(npm, 0o755);
	return directory;
}

async function runPublish(fakeDirectory: string, deadlineMs = 10_000) {
	const result = spawnSync(process.execPath, [publishCli, '--version', version], {
		encoding: 'utf8',
		env: {
			...process.env,
			PATH: `${fakeDirectory}:${process.env.PATH ?? ''}`,
			NODE_AUTH_TOKEN: '',
			NPM_TOKEN: '',
			MARKLESS_REGISTRY_DEADLINE_MS: String(deadlineMs),
			MARKLESS_REGISTRY_FIRST_DELAY_MS: '20',
			MARKLESS_REGISTRY_MAX_DELAY_MS: '40',
			MARKLESS_PUBLISH_RETRY_DELAY_MS: '10',
		},
	});
	const calls = (await readFile(join(fakeDirectory, 'calls.log'), 'utf8')).trim().split('\n');
	const uploads = (name: string) => calls.filter((call) => call === `upload ${name}`).length;
	return { exitCode: result.status ?? 1, stdout: result.stdout, stderr: result.stderr, uploads };
}

const [first, second, third] = releasePackages().map((entry) => entry.name) as [
	string,
	string,
	string,
];

test('a package npm already took and is still processing is waited for, not uploaded again', async () => {
	const fake = await fakeTools({
		[first]: { view: ['missing', 'missing', 'missing', 'visible'], upload: ['staged'] },
	});
	const result = await runPublish(fake);
	expect(result.stderr).not.toContain('publish-workspace:');
	expect(result.exitCode).toBe(0);
	expect(result.uploads(first)).toBe(1);
	expect(result.uploads(second)).toBe(1);
	expect(result.stdout).toContain(
		`${first}@${version} is already uploaded and npm is still processing it — not publishing it again.`,
	);
	expect(result.stdout).toContain(`${first}@${version} is now visible on the registry.`);
});

test('a package npm still does not show after the deadline fails the run, naming it', async () => {
	const fake = await fakeTools({ [first]: { upload: ['staged'] } });
	const result = await runPublish(fake, 200);
	expect(result.exitCode).toBe(1);
	expect(result.stderr).toContain(`npm took ${first} at ${version} but still does not show it`);
	expect(result.uploads(second)).toBe(1);
});

test('a package the registry shows is skipped without an upload', async () => {
	const fake = await fakeTools({ [first]: { view: ['visible'] } });
	const result = await runPublish(fake);
	expect(result.exitCode).toBe(0);
	expect(result.uploads(first)).toBe(0);
	expect(result.stdout).toContain(`${first}@${version} already on the registry — skipping.`);
});

test('an E401 is retried with a fresh OIDC exchange, and the retry publishes', async () => {
	const fake = await fakeTools({ [second]: { upload: ['unauthorized', 'ok'] } });
	const result = await runPublish(fake);
	expect(result.exitCode).toBe(0);
	expect(result.uploads(second)).toBe(2);
	expect(result.stdout).toContain(
		`${second}@${version} got E401 or E404 from the registry; retrying in 0 s with a fresh OIDC exchange (attempt 2 of 4).`,
	);
});

test('the answers 0.9.0 got, E503, E429 and E404 on a PUT, are retried within the run', async () => {
	const fake = await fakeTools({
		[first]: { upload: ['unavailable', 'ok'] },
		[second]: { upload: ['tooMany', 'unavailable', 'ok'] },
		[third]: { upload: ['notFound', 'unauthorized', 'ok'] },
	});
	const result = await runPublish(fake);
	expect(result.stderr).not.toContain('publish-workspace:');
	expect(result.exitCode).toBe(0);
	expect([result.uploads(first), result.uploads(second), result.uploads(third)]).toEqual([
		2, 3, 3,
	]);
	expect(result.stdout).toContain(
		`${second}@${version} got a busy or unavailable answer from the registry; retrying in 0 s with a fresh OIDC exchange (attempt 3 of 4).`,
	);
});

test('an E401 whose upload went through is finished by the retry seeing it staged or published', async () => {
	const fake = await fakeTools({
		[first]: { upload: ['unauthorized', 'staged'], view: ['missing', 'missing', 'visible'] },
		[second]: { upload: ['unauthorized', 'exists'], view: ['missing', 'missing', 'visible'] },
	});
	const result = await runPublish(fake);
	expect(result.exitCode).toBe(0);
	expect(result.uploads(first)).toBe(2);
	expect(result.uploads(second)).toBe(2);
});

test('a failed answer for an upload npm shows before the retry is not uploaded again', async () => {
	const fake = await fakeTools({
		[first]: { upload: ['unavailable'], view: ['missing', 'visible'] },
	});
	const result = await runPublish(fake);
	expect(result.exitCode).toBe(0);
	expect(result.uploads(first)).toBe(1);
	expect(result.stdout).toContain(`${first}@${version} reached the registry after all.`);
});

test('an E401 on every attempt stops the run before the next package', async () => {
	const fake = await fakeTools({ [second]: { upload: ['unauthorized'] } });
	const result = await runPublish(fake);
	expect(result.exitCode).toBe(1);
	expect(result.uploads(second)).toBe(4);
	expect(result.uploads(third)).toBe(0);
	expect(result.stderr).toContain(`${second}@${version} failed with exit code 1. Stopping here`);
});

test('any other publish failure stops the run at once, with no retry', async () => {
	const fake = await fakeTools({ [first]: { upload: ['broken', 'ok'] } });
	const result = await runPublish(fake);
	expect(result.exitCode).toBe(1);
	expect(result.uploads(first)).toBe(1);
	expect(result.uploads(second)).toBe(0);
});
