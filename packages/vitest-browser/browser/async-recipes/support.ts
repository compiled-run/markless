import { expect, vi } from 'vitest';

const REGION = '[data-markless-announcer]';

/** Fakes the clocks the recipes read. Wait with `until`, not `expect.poll`, which advances fake time while it waits. */
export function fakeClock(): void {
	vi.useFakeTimers({
		toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date', 'performance'],
	});
}

export const textOf = (selector: string): string =>
	document.querySelector(selector)?.textContent?.replace(/\s+/g, ' ').trim() ?? '';

export const listOf = (selector: string): string[] =>
	[...document.querySelectorAll(selector)].map((item) => item.textContent?.trim() ?? '');

export function press(text: string): void {
	const button = [...document.querySelectorAll('button')].find(
		(candidate) => candidate.textContent?.trim() === text,
	);
	if (!button) throw new Error(`No button "${text}"`);
	button.click();
}

export function type(value: string): void {
	const input = document.querySelector('input')!;
	input.value = value;
	input.dispatchEvent(new Event('input', { bubbles: true }));
}

export const settles = <T>(read: () => T) => expect.poll(read, { timeout: 5_000 });

let hidden = false;

/** Hides or shows the tab the way the browser does: `document.hidden` flips, then visibilitychange fires. */
export function setTabHidden(next: boolean): void {
	hidden = next;
	Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden });
	document.dispatchEvent(new Event('visibilitychange'));
}

export function restoreTab(): void {
	hidden = false;
	delete (document as { hidden?: boolean }).hidden;
}

/** Records every busy mark and every announcement from now on, so a refresh that is meant to be quiet is checked for each frame. */
export function watchLoudness() {
	const said: string[] = [];
	let busy = 0;
	const observer = new MutationObserver((records) => {
		for (const record of records) {
			if (record.type === 'attributes' && (record.target as Element).getAttribute('aria-busy') === 'true') busy++;
		}
		const now = document.querySelector(REGION)?.textContent ?? '';
		if (now && said.at(-1) !== now) said.push(now);
	});
	observer.observe(document.body, {
		subtree: true,
		childList: true,
		characterData: true,
		attributes: true,
		attributeFilter: ['aria-busy'],
	});
	if (document.querySelector('[aria-busy="true"]')) busy++;
	return () => {
		observer.disconnect();
		return { busy, said };
	};
}


/** Resolves once the page has started a repeating timer of `ms`, the moment a resumed page's `attach` runs. */
export async function intervalStarted(ms: number): Promise<void> {
	const started = vi.spyOn(globalThis, 'setInterval');
	await until(() => started.mock.calls.some(([, every]) => every === ms), true);
}


/** Resolves after two painted frames. */
export const frames = () =>
	new Promise<void>((done) => requestAnimationFrame(() => requestAnimationFrame(() => done())));

/** Waits frame by frame, without moving a fake clock, until `read()` equals `expected`. */
export async function until<T>(read: () => T, expected: T): Promise<void> {
	let failure: unknown;
	for (let frame = 0; frame < 600; frame++) {
		try {
			expect(read()).toEqual(expected);
			return;
		} catch (error) {
			failure = error;
		}
		await new Promise((done) => requestAnimationFrame(done));
	}
	throw failure;
}
