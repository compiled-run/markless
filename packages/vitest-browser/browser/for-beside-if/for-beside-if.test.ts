import { cleanup, render, renderSSR } from '@markless/vitest-browser';
import { afterEach, expect, test } from 'vitest';
import GuestsPage from './guests-page.tsrx';

afterEach(() => cleanup());

const list = (container: HTMLElement) =>
	[...container.querySelector('#list')!.children].map((element) => element.textContent?.trim());

async function checkGuests(container: HTMLElement) {
	const press = (id: string) => container.querySelector<HTMLElement>(`#${id}`)!.click();
	expect(list(container)).toEqual(['1', 'Ada', 'Grace']);
	press('clear');
	await expect.poll(() => list(container)).toEqual(['1', 'No one yet']);
	press('add');
	await expect.poll(() => list(container)).toEqual(['1', 'Guest 1']);
	press('add');
	await expect.poll(() => list(container)).toEqual(['1', 'Guest 1', 'Guest 2']);
	press('clear');
	await expect.poll(() => list(container)).toEqual(['1', 'No one yet']);
	press('add');
	await expect.poll(() => list(container)).toEqual(['1', 'Guest 3']);
}

test('SSR: the first row after the list empties appears before the @if that follows it hides', async () => {
	await checkGuests((await renderSSR(GuestsPage)).container as HTMLElement);
});

test('CSR: the first row after the list empties appears before the @if that follows it hides', async () => {
	await checkGuests((await render(GuestsPage)).container as HTMLElement);
});
