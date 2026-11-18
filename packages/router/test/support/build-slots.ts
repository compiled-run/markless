// Build slots for fixture builds, shared by every test worker of a run through a folder in the temp directory.
import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir, totalmem } from 'node:os';
import { join, resolve } from 'pathe';

const child = resolve(import.meta.dirname, 'fixture-build-child.ts');
// CI attribution measured builds at up to 2.8 GB each; a 16 GB runner holds one at a time.
const BUILD_SLOTS = Math.min(3, Math.max(1, Math.floor(totalmem() / 12 / 2 ** 30)));
const slotsDir = resolve(
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

async function acquireSlot(held = ''): Promise<string> {
	await mkdir(slotsDir, { recursive: true });
	await mkdir(queueDir, { recursive: true });
	const ticket = `${String(Date.now()).padStart(16, '0')}-${process.pid}-${String(tickets++).padStart(8, '0')}`;
	await writeFile(join(queueDir, ticket), '');
	try {
		for (;;) {
			if ((await liveTickets()).indexOf(ticket) < BUILD_SLOTS)
				for (let index = 0; index < BUILD_SLOTS; index++) {
					const slot = join(slotsDir, String(index));
					try {
						await mkdir(slot);
						await writeFile(join(slot, 'pid'), String(process.pid));
						if (held) await writeFile(join(slot, 'held'), held);
						return slot;
					} catch {
						// A worker killed mid-build leaves its slot behind.
						const holder = Number(await readFile(join(slot, 'pid'), 'utf8').catch(() => ''));
						if (holder && !alive(holder)) await rm(slot, { recursive: true, force: true });
					}
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

let builds = false;
let reserved: string | null = null;

/** Called by the fixture-build module as it loads: this test file builds fixtures. */
export const noteFixtureBuilds = () => {
	builds = true;
};

/**
 * Before the file's own hooks (setup file, long timeout): a file that builds fixtures waits its turn here, so a test's hook
 * timeout measures its build and not its place in the queue. The slot is kept for the file's first build.
 */
export async function reserveBuildSlot(): Promise<void> {
	if (builds && !reserved && !(await heldByThisFile())) reserved = await acquireSlot();
}

export async function releaseReservedSlot(): Promise<void> {
	if (reserved) await rm(reserved, { recursive: true, force: true });
	reserved = null;
}

/** A slot for one build: none when the file holds one, the file's reservation, else one in turn. */
export async function takeBuildSlot(): Promise<string | null> {
	if (await heldByThisFile()) return null;
	if (reserved) {
		const slot = reserved;
		reserved = null;
		return slot;
	}
	return acquireSlot();
}
