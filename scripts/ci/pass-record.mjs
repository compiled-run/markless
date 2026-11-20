// A record that CI's fast jobs passed on one exact tree (git's own tree hash), so the commit hook does not rerun them on that tree.

import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const git = (root, args, env = process.env) =>
	execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', env, maxBuffer: 1 << 28 }).trim();

const recordDir = (root) => resolve(root, git(root, ['rev-parse', '--git-common-dir']), 'markless-ci-pass');

/** The tree hash of the files on disk, untracked included and ignored files excluded; the real index is not touched. */
export function workingTree(root) {
	const scratch = mkdtempSync(join(tmpdir(), 'markless-tree-'));
	const index = join(scratch, 'index');
	try {
		const realIndex = resolve(root, git(root, ['rev-parse', '--git-path', 'index']));
		if (existsSync(realIndex)) {
			copyFileSync(realIndex, index);
			// git re-hashes a file whose mtime is not older than the index's; a fresh copy's mtime hid same-second edits.
			const { atime, mtime } = statSync(realIndex);
			utimesSync(index, atime, mtime);
		}
		const env = { ...process.env, GIT_INDEX_FILE: index };
		git(root, ['add', '-A'], env);
		return git(root, ['write-tree'], env);
	} finally {
		rmSync(scratch, { recursive: true, force: true });
	}
}

export const indexTree = (root) => git(root, ['write-tree']);

/** selected: the unit test files that ran, or null when every unit test ran. */
export function recordPass(root, tree, selected) {
	const dir = recordDir(root);
	mkdirSync(dir, { recursive: true });
	writeFileSync(
		join(dir, `${tree}.json`),
		JSON.stringify({ tree, at: new Date().toISOString(), selected }),
	);
}

export function findPass(root, tree) {
	try {
		return JSON.parse(readFileSync(join(recordDir(root), `${tree}.json`), 'utf8'));
	} catch {
		return null;
	}
}

/** Whether a recorded pass ran at least the unit tests a selection names (null or runAll: every test). */
export function passCovers(pass, selection) {
	if (!pass) return false;
	if (pass.selected === null) return true;
	if (!selection || selection.runAll || !Array.isArray(selection.selected)) return false;
	const ran = new Set(pass.selected);
	return selection.selected.every((file) => ran.has(file));
}

const [command, ...args] = process.argv.slice(2);
if (import.meta.url === `file://${process.argv[1]}` && command === 'check-commit') {
	// Exit 0 when the commit's tree equals the files on disk and a recorded pass on it covers the selection file.
	const root = process.cwd();
	const tree = indexTree(root);
	const pass = tree === workingTree(root) ? findPass(root, tree) : null;
	let selection = null;
	try {
		selection = JSON.parse(readFileSync(args[0], 'utf8'));
	} catch {}
	if (!passCovers(pass, selection)) process.exit(1);
	console.log(
		`tree ${tree.slice(0, 12)} passed ci:local's fast jobs at ${pass.at} (${pass.selected === null ? 'every unit test' : `${pass.selected.length} unit tests`})`,
	);
}
