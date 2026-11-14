import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'vitest';
import { largestByLabel } from './memory-watch.mjs';

const MB = 2 ** 20;

test('what held the memory reads as process kinds, largest first', () => {
	const procs = [
		{ pid: 1, rss: 100 * MB },
		{ pid: 2, rss: 3000 * MB },
		{ pid: 3, rss: 200 * MB },
	];
	const labels = new Map([
		[1, 'chrome'],
		[2, 'node client-build-process.ts'],
		[3, 'chrome'],
	]);
	expect(largestByLabel(procs, ({ pid }) => labels.get(pid)!)).toBe(
		'node client-build-process.ts 3000 MB, chrome 300 MB',
	);
});

test('the watched command keeps its exit code', () => {
	const script = fileURLToPath(new URL('./memory-watch.mjs', import.meta.url));
	let status = 0;
	try {
		execFileSync(process.execPath, [script, '--', process.execPath, '-e', 'process.exit(3)'], {
			stdio: 'pipe',
		});
	} catch (error) {
		status = (error as { status: number }).status;
	}
	expect(status).toBe(3);
});
