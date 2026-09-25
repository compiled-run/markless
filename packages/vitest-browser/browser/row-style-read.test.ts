import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../src/index.ts';
import Page from './row-outer-read/ror-style.tsrx';

afterEach(() => cleanup());

// A row's style values reading page state stay current after that state is written, served or minted.
function snapshot(container: ParentNode) {
	return [...container.querySelectorAll('[data-swatch]')].map((li) => {
		const bar = li.querySelector('[data-bar]') as HTMLElement;
		return `${li.getAttribute('data-swatch')}:${(li as HTMLElement).style.color}:${bar.style.borderColor}:${bar.style.width}`;
	});
}

function click(container: ParentNode, selector: string) {
	container.querySelector<HTMLButtonElement>(selector)!.click();
}

async function stylesFollowState(container: HTMLElement) {
	expect(snapshot(container)).toEqual(['s1:red:red:2px', 's2:red:red:3px']);
	click(container, '[data-add-swatch]');
	await expect
		.poll(() => snapshot(container))
		.toEqual(['s1:red:red:2px', 's2:red:red:3px', 's3:red:red:4px']);
	click(container, '[data-accent-blue]');
	await expect
		.poll(() => snapshot(container))
		.toEqual(['s1:blue:blue:2px', 's2:blue:blue:3px', 's3:blue:blue:4px']);
}

test('CSR: row style values follow page state', async () => {
	const screen = await render(Page);
	await stylesFollowState(screen.container as HTMLElement);
});

test('SSR resume: row style values follow page state', async () => {
	const screen = await renderSSR(Page);
	await stylesFollowState(screen.container as HTMLElement);
});
