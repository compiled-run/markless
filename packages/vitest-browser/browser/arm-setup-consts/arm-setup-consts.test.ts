import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../../src/index.ts';
import { Counter } from './if-arm.tsrx';
import { Rows } from './for-row.tsrx';
import { Tabs } from './switch-arm.tsrx';
import { Search } from './try-arm.tsrx';

// A const written at the top of an arm or row body re-runs with that block, so markup reading it stays live.
afterEach(() => cleanup());

const modes = [
	[
		'CSR',
		{
			Search: () => render(Search),
			Counter: () => render(Counter),
			Tabs: () => render(Tabs),
			Rows: () => render(Rows),
		},
	],
	[
		'SSR',
		{
			Search: () => renderSSR(Search),
			Counter: () => renderSSR(Counter),
			Tabs: () => renderSSR(Tabs),
			Rows: () => renderSSR(Rows),
		},
	],
] as const;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function type(input: HTMLInputElement, text: string) {
	for (const character of text) {
		input.value += character;
		input.dispatchEvent(new Event('input', { bubbles: true }));
		await sleep(150);
	}
}

for (const [mode, mount] of modes) {
	test(`${mode}: an @try arm const marks held results stale while a newer search runs`, async () => {
		const screen = await mount.Search();
		const container = screen.container as HTMLElement;
		if (mode === 'CSR')
			expect(container.querySelector('p')?.textContent).toBe('Searching for ...');
		await expect
			.poll(() => container.querySelectorAll('li').length, { timeout: 5_000 })
			.toBe(7);
		const list = () => container.querySelector('ul');
		const looks = () => [list()?.getAttribute('aria-busy') ?? null, list()?.getAttribute('style')];
		expect(looks()).toEqual([null, 'opacity: 1']);
		// The first keystroke wakes a served page; the second starts a refresh over a settled answer.
		await type(container.querySelector('input')!, 'a');
		await expect.poll(() => list()?.textContent, { timeout: 5_000 }).toBe('appleapricotbananagrapemango');
		await expect.poll(looks).toEqual([null, 'opacity: 1']);
		await type(container.querySelector('input')!, 'p');
		await expect.poll(looks, { timeout: 700, interval: 10 }).toEqual(['true', 'opacity: 0.5']);
		await expect.poll(() => list()?.textContent, { timeout: 5_000 }).toBe('appleapricotgrape');
		await expect.poll(looks).toEqual([null, 'opacity: 1']);
	});

	test(`${mode}: after a failed search, Try again shows the answer from the @try arm`, async () => {
		const screen = await mount.Search();
		const container = screen.container as HTMLElement;
		await expect
			.poll(() => container.querySelectorAll('li').length, { timeout: 5_000 })
			.toBe(7);
		await type(container.querySelector('input')!, 'berry!');
		await expect
			.poll(() => container.querySelector('p')?.textContent, { timeout: 5_000 })
			.toBe('Failed: Search is down');
		[...container.querySelectorAll('button')]
			.find((button) => button.textContent === 'Try again')!
			.click();
		await expect
			.poll(() => container.querySelector('ul')?.textContent, { timeout: 5_000 })
			.toBe('blueberry');
		await expect
			.poll(() => [
				container.querySelector('ul')?.getAttribute('style'),
				container.querySelectorAll('[aria-busy="true"]').length,
			])
			.toEqual(['opacity: 1', 0]);
	});

	test(`${mode}: @if and @else arm consts follow the state they read, across flips`, async () => {
		const screen = await mount.Counter();
		const container = screen.container as HTMLElement;
		const label = () => container.querySelector('[data-label]');
		expect(label()?.textContent).toBe('one');
		(container.querySelector('[data-add]') as HTMLButtonElement).click();
		await expect.poll(() => label()?.textContent).toBe('many');
		await expect.poll(() => label()?.getAttribute('title')).toBe('many');
		(container.querySelector('[data-open]') as HTMLButtonElement).click();
		await expect
			.poll(() => container.querySelector('[data-hidden]')?.textContent)
			.toBe('hidden at 2');
		(container.querySelector('[data-add]') as HTMLButtonElement).click();
		await expect
			.poll(() => container.querySelector('[data-hidden]')?.textContent)
			.toBe('hidden at 3');
		(container.querySelector('[data-open]') as HTMLButtonElement).click();
		await expect.poll(() => label()?.getAttribute('title')).toBe('many');
	});

	test(`${mode}: @switch case consts follow the state they read`, async () => {
		const screen = await mount.Tabs();
		const container = screen.container as HTMLElement;
		const panel = () => container.querySelector('[data-panel]');
		expect(panel()?.textContent).toBe('a 0');
		(container.querySelector('[data-hit]') as HTMLButtonElement).click();
		await expect.poll(() => panel()?.textContent).toBe('a 1');
		(container.querySelector('[data-b]') as HTMLButtonElement).click();
		await expect.poll(() => panel()?.textContent).toBe('other 1');
		(container.querySelector('[data-hit]') as HTMLButtonElement).click();
		await expect.poll(() => panel()?.textContent).toBe('other 2');
	});

	test(`${mode}: a @for row const reading state follows it`, async () => {
		const screen = await mount.Rows();
		const container = screen.container as HTMLElement;
		const current = () =>
			[...container.querySelectorAll('li')].map((row) => row.getAttribute('aria-current'));
		expect(current()).toEqual([null, 'true']);
		container.querySelector('button')!.click();
		await expect.poll(current).toEqual(['true', null]);
	});
}
