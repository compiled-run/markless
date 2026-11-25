import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, test } from 'vitest';
import { holdRunTempDir, RUN_TEMP_PREFIX } from './run-temp-dir.ts';

const repo = join(import.meta.dirname, '..', '..');
const made: string[] = [];
const scratch = (name: string) => {
	const dir = mkdtempSync(join(tmpdir(), name));
	made.push(dir);
	return dir;
};
afterEach(() => {
	for (const dir of made.splice(0)) rmSync(dir, { recursive: true, force: true });
});

test('a run folder and everything made in it are gone once released', () => {
	const root = scratch('run-temp-root-');
	const run = holdRunTempDir(root);
	const inner = mkdtempSync(join(run.dir, 'markless-cut-'));
	writeFileSync(join(inner, 'file'), 'x');
	run.release();
	expect(existsSync(run.dir)).toBe(false);
	expect(readdirSync(root)).toEqual([]);
});

test('a run folder left by a run that died is removed; one held by a live process stays', () => {
	const root = scratch('run-temp-root-');
	const dead = spawnSync(process.execPath, ['-e', 'console.log(process.pid)'], { encoding: 'utf8' });
	const deadPid = Number(dead.stdout.trim());
	mkdirSync(join(root, `${RUN_TEMP_PREFIX}${deadPid}-left`));
	mkdirSync(join(root, `${RUN_TEMP_PREFIX}${process.ppid}-live`));
	const run = holdRunTempDir(root);
	expect(readdirSync(root).sort()).toEqual(
		[`${RUN_TEMP_PREFIX}${process.ppid}-live`, run.dir.slice(root.length + 1)].sort(),
	);
	run.release();
});

test('a Vitest run with the setup leaves no temp folder behind', () => {
	const root = scratch('run-temp-root-');
	const project = scratch('run-temp-project-');
	const record = join(project, 'made.txt');
	writeFileSync(
		join(project, 'vitest.config.mjs'),
		`export default { test: { globalSetup: [${JSON.stringify(join(repo, 'scripts/test-utils/run-temp-dir.ts'))}], include: ['leaves.test.mjs'] } };\n`,
	);
	writeFileSync(
		join(project, 'leaves.test.mjs'),
		[
			"import { appendFileSync, mkdtempSync } from 'node:fs';",
			"import { tmpdir } from 'node:os';",
			"import { join } from 'node:path';",
			"import { test } from 'vitest';",
			"test('makes temp folders and keeps them', () => {",
			`	for (const prefix of ['markless-cut-', 'markless-fake-publish-']) appendFileSync(${JSON.stringify(record)}, mkdtempSync(join(tmpdir(), prefix)) + '\\n');`,
			'});',
			'',
		].join('\n'),
	);
	const run = spawnSync(
		join(repo, 'node_modules/.bin/vitest'),
		['run', '--root', project, '--config', join(project, 'vitest.config.mjs')],
		{ cwd: project, env: { ...process.env, TMPDIR: root }, encoding: 'utf8' },
	);
	expect(run.status, run.stdout + run.stderr).toBe(0);
	const folders = readFileSync(record, 'utf8').trim().split('\n');
	expect(folders).toHaveLength(2);
	for (const folder of folders) {
		expect(folder.startsWith(join(root, RUN_TEMP_PREFIX))).toBe(true);
		expect(existsSync(folder)).toBe(false);
	}
	expect(readdirSync(root)).toEqual([]);
}, 60_000);
