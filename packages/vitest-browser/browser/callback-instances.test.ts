import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../src/index.ts';
import DeepChainPage from './callback-instances/deep-chain.tsrx';
import ForwardedChainPage from './callback-instances/forwarded-chain.tsrx';

// Each instance of a component runs its callbacks with its own captured values, however deep it sits.
afterEach(() => cleanup());

async function eachInstanceKeepsItsCaptures(root: ParentNode, trigger: string, label: string) {
	for (const name of ['b-y', 'a-x', 'b-x', 'a-y']) {
		root.querySelector<HTMLElement>(`[${trigger}="${name}"]`)!.click();
		await expect
			.poll(() => root.querySelector(`[data-seen="${name}"]`)?.textContent)
			.toBe(`${label}:${name}`);
	}
}

test('CSR: a callback two components deep keeps its captures per instance', async () => {
	await eachInstanceKeepsItsCaptures((await render(DeepChainPage)).container, 'data-press', 'leaf');
});

test('SSR: a callback two components deep keeps its captures per instance', async () => {
	await eachInstanceKeepsItsCaptures((await renderSSR(DeepChainPage)).container, 'data-press', 'leaf');
});

async function forwardedCallbackWritesItsGroup(root: ParentNode) {
	for (const name of ['b-y', 'a-x', 'b-x', 'a-y']) {
		root.querySelector<HTMLElement>(`[data-forward="${name}"]`)!.click();
		await expect
			.poll(() => root.querySelector(`[data-seen="${name[0]}"]`)?.textContent)
			.toBe(`group:${name}`);
	}
}

test('CSR: a callback forwarded through a middle component runs for its own instance', async () => {
	await forwardedCallbackWritesItsGroup((await render(ForwardedChainPage)).container);
});

test('SSR: a callback forwarded through a middle component runs for its own instance', async () => {
	await forwardedCallbackWritesItsGroup((await renderSSR(ForwardedChainPage)).container);
});
