import { execFile } from 'node:child_process';
import { chmod, copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { promisify } from 'node:util';
import { dirname, join } from 'pathe';
import { afterEach, expect, test } from 'vitest';

const run = promisify(execFile);
const doctorTemplate = new URL('../templates/common/scripts/markless-doctor.mjs', import.meta.url);
const roots: string[] = [];

afterEach(async () => {
	await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

// An installed app with a stand-in vite-plus whose `vp` records how it was called.
async function app(buildExitCode: number): Promise<string> {
	const root = await mkdtemp(join(tmpdir(), 'markless-doctor-'));
	roots.push(root);
	await writeFile(
		join(root, 'package.json'),
		JSON.stringify({
			dependencies: { '@markless/core': '0.5.0', '@markless/router': '0.5.0' },
			devDependencies: { '@markless/analyzer': '0.5.0' },
		}),
	);
	await writeFile(
		join(root, 'tsconfig.json'),
		JSON.stringify({ tsrx: { compiler: '@markless/typescript-plugin/volar' } }),
	);
	await mkdir(join(root, 'scripts'));
	await copyFile(doctorTemplate, join(root, 'scripts/markless-doctor.mjs'));
	const vitePlus = join(root, 'node_modules/vite-plus');
	await mkdir(join(vitePlus, 'bin'), { recursive: true });
	await writeFile(
		join(vitePlus, 'package.json'),
		JSON.stringify({ name: 'vite-plus', bin: { vp: './bin/vp' } }),
	);
	await writeFile(
		join(vitePlus, 'bin/vp'),
		`#!/usr/bin/env node
import { writeFileSync } from 'node:fs';
writeFileSync(${JSON.stringify(join(root, 'vp-calls.json'))}, JSON.stringify({ args: process.argv.slice(2), cwd: process.cwd() }));
if (${buildExitCode} !== 0) console.error('build broke here');
process.exit(${buildExitCode});
`,
	);
	await chmod(join(vitePlus, 'bin/vp'), 0o755);
	return root;
}

// PATH holds only the directory of the running node, so no package manager is reachable.
async function doctor(root: string, userAgent: string) {
	try {
		const { stdout } = await run(process.execPath, ['scripts/markless-doctor.mjs'], {
			cwd: root,
			env: { PATH: dirname(process.execPath), npm_config_user_agent: userAgent },
		});
		return { code: 0, stdout };
	} catch (error) {
		const failed = error as { code: number; stdout: string };
		return { code: failed.code, stdout: failed.stdout };
	}
}

for (const [manager, userAgent] of [
	['npm', 'npm/12.0.1 node/v24.15.0 darwin arm64 workspaces/false'],
	['pnpm', 'pnpm/10.33.2 npm/? node/v24.15.0 darwin arm64'],
	['bun', 'bun/1.3.0 npm/? node/v24.15.0 darwin arm64'],
] as const) {
	test(`doctor builds with the app's own vp when ${manager} runs it and no pnpm is on PATH`, async () => {
		const root = await app(0);
		const result = await doctor(root, userAgent);
		expect(result.stdout).toContain('ok    production build');
		expect(result.code).toBe(0);
		const call = JSON.parse(await readFile(join(root, 'vp-calls.json'), 'utf8')) as {
			args: string[];
		};
		expect(call.args).toEqual(['build']);
	});
}

test('doctor reports a failing build with its output', async () => {
	const root = await app(1);
	const result = await doctor(root, 'npm/12.0.1 node/v24.15.0 darwin arm64');
	expect(result.code).toBe(1);
	expect(result.stdout).toContain('FAIL  production build');
	expect(result.stdout).toContain('build broke here');
});

test('doctor names the missing install when vite-plus is absent', async () => {
	const root = await app(0);
	await rm(join(root, 'node_modules'), { recursive: true });
	const result = await doctor(root, 'npm/12.0.1 node/v24.15.0 darwin arm64');
	expect(result.code).toBe(1);
	expect(result.stdout).toContain('FAIL  production build');
	expect(result.stdout).toContain('vite-plus');
});
