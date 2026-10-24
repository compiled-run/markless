import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'vitest';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

function runChild(bin: string, args: readonly string[]) {
	const env = Object.fromEntries(
		Object.entries(process.env).filter(([key]) => !key.startsWith('VITEST') && key !== 'TEST'),
	);
	const result = spawnSync(join(repoRoot, 'node_modules/.bin', bin), args, {
		cwd: repoRoot,
		env,
		encoding: 'utf8',
	});
	return { status: result.status, output: `${result.stdout}\n${result.stderr}` };
}

// `npx vitest` and `vp test` load different vitest installs of the same version; a module one
// transformed and cached must not be served to the other, whose `vitest` import is another instance.
test('a test file cached by one vitest install still collects its tests under the other', () => {
	const probeDir = join(repoRoot, 'scripts/test-utils', `vitest-install-probe-${randomUUID()}`);
	const probeFile = join(probeDir, 'probe.test.ts');
	mkdirSync(probeDir, { recursive: true });
	try {
		writeFileSync(
			probeFile,
			`import { expect, test } from 'vitest';\n\ntest('probe', () => {\n\texpect(1).toBe(1);\n});\n`,
		);
		const filter = relative(repoRoot, probeFile);

		const direct = runChild('vitest', ['run', '--project', 'node', filter]);
		expect(direct.output).toContain('1 passed');
		expect(direct.status).toBe(0);

		const vitePlus = runChild('vp', ['test', 'run', '--project', 'node', filter]);
		expect(vitePlus.output).toContain('1 passed');
		expect(vitePlus.status).toBe(0);
	} finally {
		rmSync(probeDir, { recursive: true, force: true });
	}
}, 120_000);
