import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../src/index.ts';
import CrossFileProps from './fixtures/cross-file-props.tsrx';

// A value handed to a component from another module keeps following the state it
// came from.
afterEach(() => cleanup());

function rowTexts(container: ParentNode) {
	return [...container.querySelectorAll('[data-row]')].map((row) => row.textContent);
}

function click(container: ParentNode) {
	container.querySelector<HTMLElement>('[data-add]')?.click();
}

async function expectPropsFollow(container: ParentNode) {
	const level = () => container.querySelector('[data-gauge]')?.getAttribute('value');
	expect(rowTexts(container)).toEqual(['0', '0']);
	expect(level()).toBe('0');

	click(container);
	await expect.poll(() => rowTexts(container)).toEqual(['1', '1']);
	await expect.poll(level).toBe('3');
	click(container);
	await expect.poll(() => rowTexts(container)).toEqual(['2', '2']);
	await expect.poll(level).toBe('6');
}

test('CSR: children text and plain prop reads from another module stay current', async () => {
	const screen = await render(CrossFileProps);
	await expectPropsFollow(screen.container as HTMLElement);
});

test('SSR resume: children text and plain prop reads from another module stay current', async () => {
	const screen = await renderSSR(CrossFileProps);
	await expectPropsFollow(screen.container);
});

// An expression recombining props alone (`hot ? 'true' : 'false'`) follows a parent that passes live state.
test('CSR: a child expression over props alone follows the parent write', async () => {
	const screen = await render(CrossFileProps);
	const container = screen.container as HTMLElement;
	click(container);
	await expect
		.poll(() => container.querySelector('[data-row]')?.getAttribute('data-hot'))
		.toBe('true');
	await expect
		.poll(() => container.querySelector('[data-gauge]')?.getAttribute('title'))
		.toBe('3 pts');
});
