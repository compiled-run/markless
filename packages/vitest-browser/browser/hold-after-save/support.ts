import { expect } from 'vitest';
import { deferred, poll } from '../back-revalidate/support.ts';
import { server } from './server.ts';

// Every hold a test made is let go, so a failed test leaves no read or save waiting into the next.
const holds: Array<{ resolve: (value: void) => void }> = [];
export function hold() {
	const held = deferred<void>();
	holds.push(held);
	return held;
}
export function releaseHolds(): void {
	server.holdReads = undefined;
	server.holdSaves = undefined;
	server.holdHandler = undefined;
	for (const held of holds.splice(0)) held.resolve();
}

export const texts = (selector: string) =>
	[...document.querySelectorAll(selector)].map((node) => node.textContent!.trim());
export const text = (selector: string) => document.querySelector(selector)?.textContent?.trim() ?? null;
export const click = (selector: string) => document.querySelector<HTMLElement>(selector)!.click();
export const frame = () => new Promise<void>((done) => requestAnimationFrame(() => done()));
export async function frames(count: number) {
	for (let at = 0; at < count; at++) await frame();
}

// Where a title is on screen: as a saved row, as a "saving" row, both, or nowhere.
export function where(title: string): 'saved' | 'saving' | 'both' | 'none' {
	const saved = texts('[data-todo]').some((row) => row.startsWith(title));
	const saving = texts('[data-saving]').includes(title);
	return saved && saving ? 'both' : saved ? 'saved' : saving ? 'saving' : 'none';
}

type Seen<T> = { frame: number; value: T };
const same = (left: unknown, right: unknown) => JSON.stringify(left) === JSON.stringify(right);
// What `look` answers at every animation frame (what is painted) and after every DOM change, each change of answer once.
export function watch<T>(look: () => T) {
	const changes: Array<Seen<T>> = [];
	const painted: T[] = [];
	let frame = 0;
	let running = true;
	const record = () => {
		const value = look();
		if (!changes.length || !same(changes.at(-1)!.value, value)) changes.push({ frame, value });
		return value;
	};
	const tick = () => {
		if (!running) return;
		frame++;
		const value = record();
		if (!painted.length || !same(painted.at(-1), value)) painted.push(value);
		requestAnimationFrame(tick);
	};
	requestAnimationFrame(tick);
	const observer = new MutationObserver(record);
	observer.observe(document.body, {
		subtree: true,
		childList: true,
		characterData: true,
		attributes: true,
	});
	tick();
	return async () => {
		await settled();
		running = false;
		observer.disconnect();
		return { changes, painted };
	};
}
export const settled = () =>
	new Promise<void>((done) => requestAnimationFrame(() => requestAnimationFrame(() => done())));

// Answers the next save, then holds the reload it causes until the returned release runs.
export async function answerSaveHoldReload(saved: { resolve: (value: void) => void }) {
	const reload = hold();
	const reads = server.reads;
	server.holdReads = reload.promise;
	saved.resolve();
	await expect.poll(() => server.reads, poll).toBe(reads + 1);
	return reload;
}
