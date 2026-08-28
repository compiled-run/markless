import { createHash } from 'node:crypto';
import { mkdir, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'pathe';

// Two test FILES build demos/music-player into the same dist/, and vitest runs
// files in parallel workers: whichever one clears dist/ second deletes the other
// one's index.html mid-build, which surfaces as
// MARKLESS_PRERENDER_CONTAINER_MISSING. `mkdir` is the atomic primitive here -
// it fails when the directory already exists, so the winner is unambiguous
// across processes. Reading what a build emitted is inside the lock too, or the
// other file's clear step can delete the artifacts out from under the reader.
const STALE_AFTER_MS = 900_000;
const POLL_MS = 250;

// Outside the repo, so a killed worker leaves no untracked directory behind;
// keyed by the demo's absolute path, so two checkouts never share one lock.
const lockPath = (demoDir: string) =>
	resolve(
		tmpdir(),
		`markless-demo-build-${createHash('sha256').update(demoDir).digest('hex').slice(0, 16)}`,
	);

/** Takes exclusive use of a demo's build directory, waiting for any holder. */
export async function acquireDemoBuildLock(demoDir: string): Promise<void> {
	const lock = lockPath(demoDir);
	for (;;) {
		try {
			await mkdir(lock);
			return;
		} catch {
			// A worker killed mid-build leaves its lock behind; without this the
			// next run would block for its whole timeout instead of the build's.
			const held = await stat(lock).catch(() => undefined);
			if (held && Date.now() - held.mtimeMs > STALE_AFTER_MS) {
				await rm(lock, { force: true, recursive: true });
				continue;
			}
			await new Promise((settle) => setTimeout(settle, POLL_MS));
		}
	}
}

export async function releaseDemoBuildLock(demoDir: string): Promise<void> {
	await rm(lockPath(demoDir), { force: true, recursive: true });
}

/** The scoped form, for a file that builds and reads inside one call. */
export async function withDemoBuildLock<T>(demoDir: string, work: () => Promise<T>): Promise<T> {
	await acquireDemoBuildLock(demoDir);
	try {
		return await work();
	} finally {
		await releaseDemoBuildLock(demoDir);
	}
}
