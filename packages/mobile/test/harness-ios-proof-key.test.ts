import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterAll, describe, expect, test } from 'vitest';
import { iosProofKey } from '../src/harness/ios-proof-key.ts';
import { JOB_VERSION, type JobSpec } from '../src/runner/store.ts';

const scratch = mkdtempSync(join(tmpdir(), 'ios-proof-key-'));
afterAll(() => rmSync(scratch, { recursive: true, force: true }));
const write = (path: string, text: string) => {
	mkdirSync(dirname(path), { recursive: true });
	writeFileSync(path, text);
};

const repo = join(scratch, 'repo');
const job = join(scratch, 'job');
const proofs = join(repo, 'packages/mobile/proofs');
const rungDirs = [join(proofs, '01-a'), join(proofs, '02-b')];
const spec: JobSpec = {
	version: JOB_VERSION,
	id: 'key',
	createdAt: 0,
	worktree: repo,
	head: 'h',
	dirty: false,
	rungs: ['01-a', '02-b'],
	platforms: ['ios'],
	host: 'adapters',
};
const files: Record<string, string> = {
	'repo/packages/mobile/src/harness/cli.ts': 'harness',
	'repo/packages/mobile/src/adapters/ios/Host.swift': 'swift host',
	'repo/packages/mobile/src/adapters/android/Host.kt': 'kotlin host',
	'repo/packages/mobile/src/harness/shells/android/Shell.kt': 'android shell',
	'repo/packages/mobile/src/runner/daemon.ts': 'runner',
	'repo/packages/mobile/package.json': '{}',
	'repo/packages/mobile/dragon.json': '{"commit":"a"}',
	'repo/pnpm-lock.yaml': 'lock',
	'repo/.github/workflows/native-proofs.yml': 'workflow',
	'repo/packages/mobile/proofs/ladder.ts': 'ladder',
	'repo/packages/mobile/proofs/01-a/App.tsrx': 'a',
	'repo/packages/mobile/proofs/02-b/App.tsrx': 'b',
	'repo/packages/mobile/proofs/03-c/App.tsrx': 'c, not run on CI',
	'job/bundle/mobile/src/adapters/ios/Host.swift': 'swift host',
	'job/bundle/mobile/src/adapters/android/Host.kt': 'kotlin host',
	'job/bundle/mobile/conformance/counter.json': '{}',
	'job/bundle/rungs/01-a/rung.json': '{"name":"01-a"}',
	'job/bundle/rungs/01-a/assets/ios/payload.json': 'ios a',
	'job/bundle/rungs/01-a/assets/android/payload.json': 'android a',
	'job/bundle/rungs/02-b/rung.json': '{"name":"02-b"}',
	'job/bundle/rungs/02-b/assets/ios/payload.json': 'ios b',
	'job/bundle/rungs/02-b/assets/android/payload.json': 'android b',
	'job/bundle/rungs/02-b/server/server/index.mjs': 'web build',
};
const edited = (path: string) =>
	path.endsWith('.json') ? JSON.stringify({ edited: path }) : `${files[path]}, edited`;
const key = () => {
	const result = iosProofKey({ job, spec, repo, rungDirs });
	if (!('key' in result)) throw new Error(`no key: ${result.notBuilt.join(', ')}`);
	return result.key;
};
for (const [path, text] of Object.entries(files)) write(join(scratch, path), text);

describe('the Native proofs iOS pass key', () => {
	test('changes with every input the iOS job reads', () => {
		for (const path of [
			'repo/packages/mobile/src/harness/cli.ts',
			'job/bundle/mobile/src/adapters/ios/Host.swift',
			'job/bundle/mobile/conformance/counter.json',
			'job/bundle/rungs/01-a/rung.json',
			'job/bundle/rungs/02-b/assets/ios/payload.json',
			'job/bundle/rungs/02-b/server/server/index.mjs',
			'repo/packages/mobile/dragon.json',
			'repo/pnpm-lock.yaml',
			'repo/.github/workflows/native-proofs.yml',
			'repo/packages/mobile/proofs/ladder.ts',
			'repo/packages/mobile/proofs/01-a/App.tsrx',
		]) {
			const before = key();
			write(join(scratch, path), edited(path));
			expect(key(), path).not.toBe(before);
			write(join(scratch, path), files[path]!);
			expect(key(), path).toBe(before);
		}
	});

	test('stays the same when only Android, the phone runner or a rung CI does not run changes', () => {
		const before = key();
		for (const path of [
			'repo/packages/mobile/src/adapters/android/Host.kt',
			'repo/packages/mobile/src/harness/shells/android/Shell.kt',
			'repo/packages/mobile/src/runner/daemon.ts',
			'job/bundle/mobile/src/adapters/android/Host.kt',
			'job/bundle/rungs/01-a/assets/android/payload.json',
			'repo/packages/mobile/proofs/03-c/App.tsrx',
		])
			write(join(scratch, path), edited(path));
		write(join(scratch, 'repo/packages/mobile/proofs/01-a/screenshots/ios/step-1.png'), 'png');
		expect(key()).toBe(before);
	});

	test('is not given when a rung did not build', () => {
		write(
			join(job, 'bundle/rungs/02-b/rung.json'),
			JSON.stringify({ name: '02-b', buildError: 'no Dragon checkout' }),
		);
		expect(iosProofKey({ job, spec, repo, rungDirs })).toEqual({ notBuilt: ['02-b'] });
		write(join(job, 'bundle/rungs/02-b/rung.json'), files['job/bundle/rungs/02-b/rung.json']!);
	});
});
