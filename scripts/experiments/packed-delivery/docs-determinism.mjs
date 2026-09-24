import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { cp, mkdir, mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const samples = Number(process.env.DOCS_BUILD_SAMPLES ?? 3);
assert.ok(Number.isSafeInteger(samples) && samples >= 2);
const directory = await mkdtemp('/private/tmp/markless-docs-determinism-');
const result = { directory, samples, builds: [] };
const persist = () => writeFile(directory + '/results.json', JSON.stringify(result, null, 2));
console.log(JSON.stringify({ directory, samples }));

for (let index = 0; index < samples; index++) {
	const logPath = `${directory}/build-${index}.log`;
	const log = createWriteStream(logPath);
	const started = performance.now();
	const child = spawn('pnpm', ['--dir', 'website', 'run', 'doctor'], {
		cwd: root,
		env: process.env,
		stdio: ['ignore', 'pipe', 'pipe'],
	});
	child.stdout.pipe(log, { end: false });
	child.stderr.pipe(log, { end: false });
	const exitCode = await new Promise((resolve, reject) => {
		child.once('error', reject);
		child.once('close', resolve);
	});
	await new Promise((resolve) => log.end(resolve));
	if (exitCode !== 0) {
		result.failure = { index, exitCode, logPath };
		await persist();
		throw Error(`Docs build ${index} failed; see ${logPath}`);
	}
	const output = `${directory}/build-${index}/.output`;
	await mkdir(`${directory}/build-${index}`, { recursive: true });
	await cp(root + 'website/.output', output, { recursive: true });
	const files = await Promise.all(
		(await readdir(output + '/public/build'))
			.filter((name) => name.endsWith('.js'))
			.sort()
			.map(async (name) => {
				const bytes = await readFile(output + '/public/build/' + name);
				return {
					name,
					bytes: bytes.length,
					sha256: createHash('sha256').update(bytes).digest('hex'),
				};
			}),
	);
	const sameAsFirst =
		index === 0 || JSON.stringify(files) === JSON.stringify(result.builds[0].files);
	result.builds.push({
		index,
		output,
		logPath,
		elapsedMs: performance.now() - started,
		files,
		sameAsFirst,
	});
	await persist();
	console.log(JSON.stringify({ index, output, files: files.length, sameAsFirst }));
}
assert.ok(
	result.builds.every((build) => build.sameAsFirst),
	`Repeated docs output differs; see ${directory}/results.json`,
);
