import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, expect, test } from 'vitest';
import { CreateProgram } from '../src/index.ts';

const cleanupRoots: string[] = [];

afterEach(async () => {
	await Promise.all(
		cleanupRoots.splice(0).map((root) => rm(root, { force: true, recursive: true })),
	);
});

test('creates a minimal Arcade Router app with TSRX pages', async () => {
	const root = await mkdtemp(join(tmpdir(), 'arcade-router-cli-'));
	cleanupRoots.push(root);

	const program = new CreateProgram();
	const input = program.validate(['my-app', '--yes'], runtime(root));
	const options = await program.interact(input, runtime(root));
	await program.execute({ ...options, install: false, git: false }, runtime(root));

	const appRoot = join(root, 'my-app');
	await expect(stat(join(appRoot, 'pages/index.tsrx'))).resolves.toMatchObject({
		isFile: expect.any(Function),
	});
	await expect(stat(join(appRoot, 'public'))).resolves.toMatchObject({
		isDirectory: expect.any(Function),
	});
	await expect(readFile(join(appRoot, 'vite.config.ts'), 'utf-8')).resolves.toContain(
		"import { router } from '@arcade/router/vite';",
	);
	await expect(readFile(join(appRoot, 'tsconfig.json'), 'utf-8')).resolves.not.toContain('tsx');
	await expect(stat(join(appRoot, 'pages/index.tsx'))).rejects.toMatchObject({
		code: 'ENOENT',
	});
});

function runtime(cwd: string) {
	return {
		cwd: () => cwd,
		env: { npm_config_user_agent: 'pnpm/10.33.2' },
		isTTY: false,
		stdout: { write: () => true },
		stderr: { write: () => true },
		spawn: () => ({ status: 0 }),
	};
}
