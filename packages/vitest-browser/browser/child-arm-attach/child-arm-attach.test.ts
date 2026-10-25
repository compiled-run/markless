import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../../src/index.ts';
import Page from './caa-page.tsrx';

afterEach(cleanup);

const all = (selector: string) => [...document.querySelectorAll<HTMLElement>(selector)];

// An attach inside an arm a child component opens: its symbol is the child's,
// so it must be routed through the child's instance like the child's handlers.
async function pinArmAttachRuns() {
	all('[data-toggle]')[1]!.click();
	await expect
		.poll(() => all('[data-panel]').map((panel) => panel.dataset.attached))
		.toEqual(['yes']);
	expect(document.activeElement).toBe(all('[data-panel]')[0]);

	all('[data-toggle]')[0]!.click();
	await expect
		.poll(() => all('[data-panel]').map((panel) => panel.dataset.attached))
		.toEqual(['yes', 'yes']);
	expect(document.activeElement).toBe(all('[data-panel]')[0]);
}

test('CSR: an attach in an arm a child component opens runs', async () => {
	await render(Page);
	await pinArmAttachRuns();
});

test('SSR resume: an attach in an arm a child component opens runs', async () => {
	await renderSSR(Page);
	await pinArmAttachRuns();
});
