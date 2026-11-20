// Build slots for fixture builds, shared by every test worker of a run through a folder in the temp directory.
import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir, totalmem } from 'node:os';
import { join, relative, resolve } from 'pathe';
import { expect } from 'vitest';

const child = resolve(import.meta.dirname, 'fixture-build-child.ts');
// CI attribution measured builds at up to 2.8 GB each; a 16 GB runner holds one at a time.
const BUILD_SLOTS = Math.min(3, Math.max(1, Math.floor(totalmem() / 12 / 2 ** 30)));
// CI's unit budget names the folder, so it can tell which test files hold a slot while it samples memory.
const slotsDir =
	process.env.MARKLESS_BUILD_SLOTS_DIR ??
	resolve(
		tmpdir(),
		`markless-fixture-builds-${createHash('sha256').update(child).digest('hex').slice(0, 16)}`,
	);
const HELD_FOR_FILE = 'file';

const alive = (pid: number) => {
	try {
		process.kill(pid, 0);
		return true;
	} catch (error) {
		return (error as NodeJS.ErrnoException).code === 'EPERM';
	}
};

const heldByThisFile = async (): Promise<boolean> => {
	for (const slot of await readdir(slotsDir).catch(() => [])) {
		const [pid, held] = await Promise.all([
			readFile(join(slotsDir, slot, 'pid'), 'utf8').catch(() => ''),
			readFile(join(slotsDir, slot, 'held'), 'utf8').catch(() => ''),
		]);
		if (Number(pid) === process.pid && held === HELD_FOR_FILE) return true;
	}
	return false;
};

// Waiters take slots in the order they asked: a file that builds again and again would otherwise win every slot it frees.
const queueDir = `${slotsDir}-queue`;
let tickets = 0;

async function liveTickets(): Promise<string[]> {
	const live: string[] = [];
	for (const ticket of (await readdir(queueDir).catch(() => [])).sort()) {
		const holder = Number(ticket.split('-')[1]);
		if (holder && !alive(holder)) await rm(join(queueDir, ticket), { force: true });
		else live.push(ticket);
	}
	return live;
}

const testFile = () => {
	const path = expect.getState().testPath;
	return path ? relative(process.cwd(), path) : `pid ${process.pid}`;
};

async function acquireSlot(held = ''): Promise<string> {
	await mkdir(slotsDir, { recursive: true });
	await mkdir(queueDir, { recursive: true });
	const ticket = `${String(Date.now()).padStart(16, '0')}-${process.pid}-${String(tickets++).padStart(8, '0')}`;
	await writeFile(join(queueDir, ticket), '');
	const asked = Date.now();
	const holders = new Set<string>();
	try {
		for (;;) {
			if ((await liveTickets()).indexOf(ticket) < BUILD_SLOTS)
				for (let index = 0; index < BUILD_SLOTS; index++) {
					const slot = join(slotsDir, String(index));
					try {
						await mkdir(slot);
					} catch {
						holders.add(await readFile(join(slot, 'file'), 'utf8').catch(() => 'unknown'));
						// A worker killed mid-build leaves its slot behind.
						const holder = Number(await readFile(join(slot, 'pid'), 'utf8').catch(() => ''));
						if (holder && !alive(holder)) await rm(slot, { recursive: true, force: true });
						continue;
					}
					try {
						await writeFile(join(slot, 'pid'), String(process.pid));
						await writeFile(join(slot, 'file'), testFile());
						if (held) await writeFile(join(slot, 'held'), held);
					} catch (error) {
						await rm(slot, { recursive: true, force: true });
						throw error;
					}
					const waited = Date.now() - asked;
					// A long wait is what turns a short build into a hook timeout; the CI log then says who held the slots.
					if (waited > 30_000)
						console.error(
							`[build-slot] ${testFile()} waited ${Math.round(waited / 1000)} s for a build slot, held meanwhile by ${[...holders].join(', ') || 'unknown'}`,
						);
					return slot;
				}
			await new Promise((settle) => setTimeout(settle, 50));
		}
	} finally {
		await rm(join(queueDir, ticket), { force: true });
	}
}

/**
 * Takes a build slot until the returned release runs, for a test file that builds in its own
 * process: Rolldown keeps a build's memory until the process exits, so the slot covers the file.
 */
export async function holdBuildSlot(): Promise<() => Promise<void>> {
	const slot = await acquireSlot(HELD_FOR_FILE);
	return () => rm(slot, { recursive: true, force: true });
}

/** A slot for one build, released by the returned function: none when the file holds one, else one in turn. */
export async function takeBuildSlot(): Promise<() => Promise<void>> {
	if (await heldByThisFile()) return async () => {};
	const slot = await acquireSlot();
	return () => rm(slot, { recursive: true, force: true });
}
