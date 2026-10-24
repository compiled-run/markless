// publish-workspace against a fake `pnpm` and `npm` on PATH that answer like the registry did on 0.6.0 and 0.7.0.
import { spawnSync } from 'node:child_process';
import { chmod, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
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
// The fakes are POSIX shell, not Node: one run makes about thirty calls, and thirty Node startups
// pushed the E401 case past the test timeout on a loaded machine.
async function fakeTools(scripts: Readonly<Record<string, Script>>) {
	const directory = await mkdtemp(join(tmpdir(), 'markless-fake-publish-'));
	for (const sub of ['answers', 'counts', 'replies']) await mkdir(join(directory, sub));
	const file = (kind: string, name: string) => `${kind}-${name.replace(/[@/]/g, '_')}`;
	for (const [name, script] of Object.entries(scripts))
		for (const kind of ['upload', 'view'] as const)
			if (script[kind])
				await writeFile(join(directory, 'answers', file(kind, name)), `${script[kind]!.join('\n')}\n`);
	for (const [answer, reply] of Object.entries(uploadAnswers)) {
		await writeFile(join(directory, 'replies', `${answer}.stderr`), reply.stderr);
		await writeFile(join(directory, 'replies', `${answer}.status`), String(reply.status));
	}
	const answer = `answer() {
	key="$1-$(printf '%s' "$2" | tr '@/' '__')"
	count="${directory}/counts/$key"
	index=$(cat "$count" 2>/dev/null || echo 0)
	echo $((index + 1)) > "$count"
	echo "$1 $2" >> "${directory}/calls.log"
	answers="${directory}/answers/$key"
	if [ -f "$answers" ]; then
		reply=$(sed -n "$((index + 1))p" "$answers")
		[ -n "$reply" ] || reply=$(tail -n 1 "$answers")
	else
		reply="$3"
	fi
}
`;
	const pnpm = join(directory, 'pnpm');
	await writeFile(
		pnpm,
		`#!/bin/sh
${answer}
name="$2"
answer upload "$name" ok
sed "s|NAME|$name|" "${directory}/replies/$reply.stderr" >&2
exit "$(cat "${directory}/replies/$reply.status")"
`,
	);
	const npm = join(directory, 'npm');
	await writeFile(
		npm,
		`#!/bin/sh
${answer}
name="\${2%@*}"
answer view "$name" missing
if [ "$reply" = visible ]; then
	echo '${version}'
	exit 0
fi
printf 'npm error code E404\\nnpm error 404 No match found for version ${version}\\n' >&2
exit 1
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
