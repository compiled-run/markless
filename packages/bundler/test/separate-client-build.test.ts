import { createHash } from 'node:crypto';
import { mkdtemp, readdir, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'pathe';
import { createBuilder } from 'vite';
import { expect, test } from 'vitest';
import { generateBuildScaleApp } from '../../../scripts/benchmarks/build-scale/generate.mjs';
import { SEPARATE_CLIENT_BUILD_ENV } from '../src/vite/separate-client-build.ts';

const packages = join(import.meta.dirname, '../..');

async function writeConfig(app: string, pidLog: string) {
	await writeFile(
		join(app, 'vite.config.ts'),
		`import { appendFileSync } from 'node:fs';
import { markless } from ${JSON.stringify(join(packages, 'core/src/vite.ts'))};
import { router } from ${JSON.stringify(join(packages, 'router/src/vite/index.ts'))};
export default {
	logLevel: 'silent',
	plugins: [
		markless(),
		router(),
		{ name: 'pid-log', buildStart() { appendFileSync(${JSON.stringify(pidLog)}, this.environment.name + ' ' + process.pid + '\\n'); } },
	],
};
`,
	);
}

async function build(app: string, pidLog: string, separate: boolean) {
	await rm(pidLog, { force: true });
	await rm(join(app, '.output'), { recursive: true, force: true });
	await rm(join(app, 'node_modules/.vite'), { recursive: true, force: true });
	const before = process.env[SEPARATE_CLIENT_BUILD_ENV];
	if (separate) delete process.env[SEPARATE_CLIENT_BUILD_ENV];
	else process.env[SEPARATE_CLIENT_BUILD_ENV] = '0';
	try {
		const builder = await createBuilder({ root: app, configFile: join(app, 'vite.config.ts') });
		await builder.buildApp();
	} finally {
		if (before === undefined) delete process.env[SEPARATE_CLIENT_BUILD_ENV];
		else process.env[SEPARATE_CLIENT_BUILD_ENV] = before;
	}
	const pids = Object.fromEntries(
		(await readFile(pidLog, 'utf8'))
			.trim()
			.split('\n')
			.map((line) => line.split(' ')),
	);
	const files = new Map<string, string>();
	const output = join(app, '.output');
	for (const entry of await readdir(output, { recursive: true, withFileTypes: true }))
		if (entry.isFile()) {
			const path = join(entry.parentPath, entry.name);
			const name = path.slice(output.length);
			files.set(
				name,
				createHash('sha256')
					.update(await comparable(name, path))
					.digest('hex'),
			);
		}
	return { pids, files };
}

// Nitro stamps its build time, and its public asset table lists each file's write time in completion order.
async function comparable(name: string, path: string): Promise<string> {
	const text = await readFile(path, 'latin1');
	if (name === '/nitro.json') return text.replace(/"date": "[^"]*"/, '');
	if (name !== '/server/index.mjs') return text;
	return text
		.replace(/"mtime": "[^"]*"/g, '')
		.split('\n')
		.sort()
		.join('\n');
}

// Rolldown frees a build's native memory only when its process exits, so the client graph builds in a child process.
test(
	'a config-file build runs the client environment in its own process and ships the same files',
	{ timeout: 600_000 },
	async () => {
		const scratch = await realpath(await mkdtemp(join(tmpdir(), 'markless-client-process-')));
		try {
			const app = join(scratch, 'app');
			const pidLog = join(scratch, 'pids.txt');
			await generateBuildScaleApp({
				dir: app,
				pages: 3,
				components: 4,
				perPage: 2,
				layers: 1,
			});
			await writeConfig(app, pidLog);

			const together = await build(app, pidLog, false);
			expect(together.pids.client).toBe(String(process.pid));
			expect(together.pids.ssr).toBe(String(process.pid));

			const separate = await build(app, pidLog, true);
			expect(separate.pids.client).not.toBe(String(process.pid));
			expect(separate.pids.ssr).toBe(String(process.pid));
			expect(separate.pids.nitro).toBe(String(process.pid));

			expect(together.files.size).toBeGreaterThan(0);
			expect(separate.files).toEqual(together.files);
		} finally {
			await rm(scratch, { recursive: true, force: true });
		}
	},
);
