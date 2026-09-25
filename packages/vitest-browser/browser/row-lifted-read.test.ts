import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../src/index.ts';
import Page from './row-outer-read/ror-lifted.tsrx';

afterEach(() => cleanup());

// A row slot computed from page state alone, built after load, shows the current value.
function snapshot(container: ParentNode) {
	return [...container.querySelectorAll('[data-swatch]')].map(
		(node) =>
			`${node.getAttribute('data-swatch')}:${node.getAttribute('title')}:${node.textContent}`,
	);
}

async function mintedRowsReadPageState(container: HTMLElement) {
	container.querySelector<HTMLButtonElement>('[data-add-swatch]')!.click();
	await expect
		.poll(() => snapshot(container))
		.toEqual(['s1:warm:RED', 's2:warm:RED', 's3:warm:RED']);
	container.querySelector<HTMLButtonElement>('[data-accent-blue]')!.click();
	await expect
		.poll(() => snapshot(container))
		.toEqual(['s1:cool:BLUE', 's2:cool:BLUE', 's3:cool:BLUE']);
}

test('CSR: a minted row reads page-state expressions', async () => {
	const screen = await render(Page);
	await mintedRowsReadPageState(screen.container as HTMLElement);
});

test('SSR resume: a minted row reads page-state expressions', async () => {
	const screen = await renderSSR(Page);
	await mintedRowsReadPageState(screen.container as HTMLElement);
});
