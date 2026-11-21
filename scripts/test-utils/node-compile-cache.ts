import { readdirSync, renameSync, rmSync } from 'node:fs';
import { enableCompileCache } from 'node:module';
import { join, resolve } from 'node:path';

// A full node-project run writes about 4,100 entries and adds about 1,000 a run for files a run creates afresh.
const MAX_ENTRIES = 16_384;

/**
 * Turns on Node's on-disk compile cache for this process and, through the environment, for every test
 * worker, fixture build and build worker it starts. Node checks each entry against the source's content
 * hash and keeps one directory per Node build, so an edited file or another Node version never reads a
 * stale entry. `NODE_COMPILE_CACHE` picks another directory; `NODE_DISABLE_COMPILE_CACHE=1` turns it off.
 */
export function useNodeCompileCache(rootDir: string): void {
	if (process.env.NODE_DISABLE_COMPILE_CACHE) return;
	const directory = (process.env.NODE_COMPILE_CACHE ||= resolve(
		rootDir,
		'node_modules/.cache/node-compile-cache',
	));
	pruneCompileCache(directory);
	enableCompileCache(directory);
}

/** Node never prunes the directory, so one cold run is the price of keeping it bounded. */
export function pruneCompileCache(directory: string, maxEntries = MAX_ENTRIES): void {
	if (entryCount(directory) <= maxEntries) return;
	// Removed in place, another test process writing an entry fails the removal with ENOTEMPTY; moved aside, it cannot.
	const aside = `${directory}.pruned-${process.pid}`;
	try {
		renameSync(directory, aside);
	} catch {
		return;
	}
	rmSync(aside, { recursive: true, force: true });
}

function entryCount(directory: string): number {
	try {
		return readdirSync(directory, { withFileTypes: true }).reduce(
			(count, entry) =>
				count + (entry.isDirectory() ? readdirSync(join(directory, entry.name)).length : 1),
			0,
		);
	} catch {
		return 0;
	}
}
