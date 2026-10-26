import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../../src/index.ts';
import { FrozenIntrinsicsPage } from './frozen-intrinsics-page.tsrx';

// Lockdown-style hardening freezes the built-in prototypes for the rest of this file's frame.
afterEach(() => cleanup());

const errors: string[] = [];
window.addEventListener('error', (event) => errors.push(String(event.message)));
window.addEventListener('unhandledrejection', (event) => errors.push(String(event.reason)));

function freezeIntrinsics() {
	for (const intrinsic of [Object, Array, Map, Set, Function, Promise])
		Object.freeze(intrinsic.prototype);
}

async function updatesWhileFrozen(container: HTMLElement) {
	freezeIntrinsics();
	const output = () => container.querySelector('[data-o]')?.textContent;
	expect(output()).toBe('a|Ada');
	container.querySelector<HTMLButtonElement>('[data-run]')!.click();
	await expect.poll(output).toBe('a,b|Bo');
	expect(errors).toEqual([]);
}

test('server render + resume: the page updates with frozen built-in prototypes', async () => {
	await updatesWhileFrozen((await renderSSR(FrozenIntrinsicsPage)).container as HTMLElement);
});

test('browser render: the page renders and updates with prototypes frozen before it loads', async () => {
	freezeIntrinsics();
	await updatesWhileFrozen((await render(FrozenIntrinsicsPage)).container as HTMLElement);
});
