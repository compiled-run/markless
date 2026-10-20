import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../../src/index.ts';
import StaticArmTabs from './static-arm-tabs.tsrx';

afterEach(cleanup);

const panel = () => document.querySelector('[data-panel]')?.getAttribute('data-panel') ?? null;
const rows = () => document.querySelectorAll('[data-panel] li');
const press = (selector: string) => document.querySelector<HTMLElement>(selector)!.click();

async function switchesBothWays() {
	expect(panel()).toBe('one');
	expect(rows()).toHaveLength(500);
	expect(rows()[7]!.textContent).toBe('one {7} <b>one-77');

	press('[data-two]');
	await expect.poll(panel).toBe('two');
	expect(rows()).toHaveLength(500);
	expect(rows()[499]!.innerHTML).toBe('<code>two {499} &lt;b&gt;</code><span>two-499</span>499');
	expect(document.querySelector('[data-after]')!.textContent).toBe('two');

	press('[data-one]');
	await expect.poll(panel).toBe('one');
	expect(rows()).toHaveLength(500);
	expect(rows()[0]!.textContent).toBe('one {0} <b>one-00');
}

test('SSR: a large static @if arm with literal text switches both ways', async () => {
	await renderSSR(StaticArmTabs);
	await switchesBothWays();
});

test('CSR: a large static @if arm with literal text switches both ways', async () => {
	await render(StaticArmTabs);
	await switchesBothWays();
});
