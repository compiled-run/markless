import { cleanup, render, renderSSR } from '@markless/vitest-browser';
import { afterEach, expect, test } from 'vitest';
import ProbePage from './probe-page.tsrx';

// A handler inside an @if arm inside a @for row reads its own row's item.
afterEach(() => cleanup());

async function pressEachRow(container: ParentNode) {
	for (const id of ['b', 'a']) {
		container.querySelector<HTMLButtonElement>(`[data-edit="${id}"]`)!.click();
		await expect.poll(() => container.querySelector('[data-saved]')?.textContent).toBe(`edit:${id}`);
	}
}

test('SSR: an arm handler inside a row reads that row', async () => {
	await pressEachRow((await renderSSR(ProbePage)).container);
});

test('CSR: an arm handler inside a row reads that row', async () => {
	await pressEachRow((await render(ProbePage)).container);
});
