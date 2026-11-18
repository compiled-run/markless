import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { findPass, indexTree, passCovers, recordPass, workingTree } from './pass-record.mjs';

let root: string;
// Inside the commit hook git exports GIT_DIR and GIT_INDEX_FILE, which would point these git calls at the real repository.
const hookEnv = Object.entries(process.env).filter(([key]) => key.startsWith('GIT_'));
beforeAll(() => {
	for (const [key] of hookEnv) delete process.env[key];
});
afterAll(() => {
	for (const [key, value] of hookEnv) process.env[key] = value;
});

const git = (...args: string[]) =>
	execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' }).trim();

beforeEach(() => {
	root = mkdtempSync(join(tmpdir(), 'pass-record-'));
	git('init', '-q');
	writeFileSync(join(root, 'a.ts'), 'export const a = 1;\n');
	writeFileSync(join(root, '.gitignore'), 'ignored/\n');
	git('add', '-A');
	git('-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '--no-gpg-sign', '-m', 'base');
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

describe('working tree key', () => {
	it('is the tree a commit of every file on disk would have, without touching the index', () => {
		writeFileSync(join(root, 'a.ts'), 'export const a = 2;\n');
		writeFileSync(join(root, 'new.ts'), 'export {};\n');
		const onDisk = workingTree(root);
		expect(git('diff', '--cached', '--name-only')).toBe('');
		expect(onDisk).not.toBe(indexTree(root));
		git('add', '-A');
		expect(indexTree(root)).toBe(onDisk);
	});

	it('ignores gitignored files and changes with any tracked byte', () => {
		const clean = workingTree(root);
		writeFileSync(join(root, 'ignored-file'), 'x');
		expect(workingTree(root)).not.toBe(clean);
		rmSync(join(root, 'ignored-file'));
		execFileSync('mkdir', ['-p', join(root, 'ignored')]);
		writeFileSync(join(root, 'ignored/x.log'), 'x');
		expect(workingTree(root)).toBe(clean);
	});
});

describe('a recorded pass covers a commit selection', () => {
	it('when every unit test ran', () => {
		recordPass(root, 'tree1', null);
		const pass = findPass(root, 'tree1');
		expect(passCovers(pass, { runAll: 'a config changed', selected: null })).toBe(true);
		expect(passCovers(pass, null)).toBe(true);
	});

	it('only for selections inside the tests that ran', () => {
		recordPass(root, 'tree2', ['x.test.ts', 'y.test.ts']);
		const pass = findPass(root, 'tree2');
		expect(passCovers(pass, { runAll: null, selected: ['x.test.ts'] })).toBe(true);
		expect(passCovers(pass, { runAll: null, selected: ['z.test.ts'] })).toBe(false);
		expect(passCovers(pass, { runAll: 'a config changed', selected: null })).toBe(false);
		expect(passCovers(pass, null)).toBe(false);
	});

	it('never for a tree with no record', () => {
		expect(passCovers(findPass(root, 'unknown'), { runAll: null, selected: [] })).toBe(false);
	});
});
