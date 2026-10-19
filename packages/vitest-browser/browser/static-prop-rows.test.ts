import { afterEach, expect, test } from 'vitest';
import { cleanup, renderSSR } from '../src/index.ts';
import { App } from './fixtures/static-prop-rows.tsrx';

afterEach(cleanup);

type MintLoad = (...args: unknown[]) => Promise<unknown>;

// Pins that no gesture waits for the row-building code of a list over a prop its parent served as a constant: the
// loader is held open, and the click still answers.
test('a click answers while the row code of a list over a constant prop is still loading', async () => {
	const screen = await renderSSR(App);
	const container = screen.container as HTMLElement;
	const releases: Array<() => void> = [];
	let installed: MintLoad | undefined;
	Object.defineProperty(globalThis, '__marklessRowMint', {
		configurable: true,
		get: () =>
			installed &&
			((...args: unknown[]) =>
				new Promise((resolve) => releases.push(() => resolve(installed!(...args))))),
		set: (load: MintLoad) => (installed = load),
	});
	try {
		container.querySelector<HTMLButtonElement>('[data-increment]')!.click();
		await expect.poll(() => container.querySelector('[data-count]')!.textContent).toBe('1');
		expect(container.querySelector('[data-clicked]')).not.toBeNull();
		await expect.poll(() => releases.length, { timeout: 5000 }).toBeGreaterThan(0);
	} finally {
		for (const release of releases.splice(0)) release();
		const load = installed;
		delete (globalThis as { __marklessRowMint?: MintLoad }).__marklessRowMint;
		if (load) (globalThis as { __marklessRowMint?: MintLoad }).__marklessRowMint = load;
	}
	expect(
		Array.from(container.querySelectorAll('[data-contents] li'), (row) => row.textContent),
	).toEqual(['Intro', 'Usage', 'FAQ']);
	container.querySelector<HTMLButtonElement>('[data-increment]')!.click();
	await expect.poll(() => container.querySelector('[data-count]')!.textContent).toBe('2');
});
