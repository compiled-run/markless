import { afterEach, expect, test } from 'vitest';
import { cleanup, render } from '../../src/index.ts';
import { releaseTitle, resetTitleGate, titleAsked } from './gate.ts';
import { Report } from './report.tsrx';

afterEach(() => {
	cleanup();
	resetTitleGate();
});

const poll = { timeout: 5_000, interval: 5 };

// The settled arm's code loads while the CSR mount shows @pending, side by side with the data, not after it.
test('CSR: a waiting @try starts loading its settled arm code before its data resolves', async () => {
	const base = Report as unknown as { readonly loadSymbol: (symbolId: string) => unknown };
	const requested: string[] = [];
	let dataResolved = false;
	const afterData: string[] = [];
	const screen = await render({
		...base,
		loadSymbol: (symbolId: string) => {
			requested.push(symbolId);
			if (dataResolved) afterData.push(symbolId);
			return base.loadSymbol(symbolId);
		},
	} as typeof Report);
	const container = screen.container as HTMLElement;
	await expect.poll(() => container.querySelector('[data-pending]')?.textContent, poll).toBe('Loading');
	await expect.poll(titleAsked, poll).toBe(true);
	await new Promise((resolve) => setTimeout(resolve, 50));
	const beforeData = [...requested];
	dataResolved = true;
	releaseTitle('Quarterly');
	await expect.poll(() => container.querySelector('[data-title]')?.textContent, poll).toBe('Quarterly');
	expect(afterData.filter((symbolId) => !beforeData.includes(symbolId))).toEqual([]);

	container.querySelector<HTMLElement>('[data-tally]')!.click();
	await expect.poll(() => container.querySelector('[data-tally]')?.textContent, poll).toBe('4');
});
