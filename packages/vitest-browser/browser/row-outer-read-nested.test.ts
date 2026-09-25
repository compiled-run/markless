import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../src/index.ts';
import Page from './row-outer-read/ror-nested.tsrx';

afterEach(() => cleanup());

// Rows and the rows nested in them, served or built after load, follow page state they read.
function snapshot(container: ParentNode) {
	return [...container.querySelectorAll('[data-lane], [data-cell]')].map(
		(node) => `${node.getAttribute('data-lane') ?? node.getAttribute('data-cell')}:${node.className}`,
	);
}

function click(container: ParentNode, selector: string) {
	container.querySelector<HTMLButtonElement>(selector)!.click();
}

async function pickFollows(container: HTMLElement) {
	expect(snapshot(container)).toEqual(['x:lit', 'x1:lit', 'x2:lit', 'y:dim', 'y1:dim']);
	click(container, '[data-pick-y]');
	await expect.poll(() => snapshot(container)).toEqual(['x:dim', 'x1:dim', 'x2:dim', 'y:lit', 'y1:lit']);
	click(container, '[data-add-z]');
	await expect
		.poll(() => snapshot(container))
		.toEqual(['x:dim', 'x1:dim', 'x2:dim', 'y:lit', 'y1:lit', 'z:dim', 'z1:dim']);
	click(container, '[data-pick-z]');
	await expect
		.poll(() => snapshot(container))
		.toEqual(['x:dim', 'x1:dim', 'x2:dim', 'y:dim', 'y1:dim', 'z:lit', 'z1:lit']);
}

test('CSR: rows nested under rows follow page state', async () => {
	const screen = await render(Page);
	await pickFollows(screen.container as HTMLElement);
});

test('SSR resume: rows nested under rows follow page state', async () => {
	const screen = await renderSSR(Page);
	await pickFollows(screen.container as HTMLElement);
});
