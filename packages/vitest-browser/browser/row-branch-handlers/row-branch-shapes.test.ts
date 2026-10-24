import { cleanup, render, renderSSR } from '@markless/vitest-browser';
import { afterEach, expect, test } from 'vitest';
import AfterBranchRowsPage from './after-branch-rows-page.tsrx';
import ConstantRowsPage from './constant-rows-page.tsrx';
import EditRowDemoPage from './edit-row-demo-page.tsrx';
import GrowRowsPage from './grow-rows-page.tsrx';
import IndexRowsPage from './index-rows-page.tsrx';
import NestedRowsPage from './nested-rows-page.tsrx';
import PositionKeyedPage from './position-keyed-page.tsrx';
import SwitchRowsPage from './switch-rows-page.tsrx';
import WrappedComponentRowsPage from './wrapped-component-rows-page.tsrx';

// Every row flips its own @if/@switch when anything its test reads moves, after resume as after a client render.
afterEach(() => cleanup());

function press(container: ParentNode, selector: string) {
	const element = container.querySelector<HTMLElement>(selector);
	if (!element) throw new Error(`Expected ${selector} on the page.`);
	element.click();
}

const text = (container: ParentNode, selector: string) =>
	Array.from(container.querySelectorAll(selector)).map((node) => node.textContent?.trim() ?? '');

async function checkSwitchRows(container: HTMLElement) {
	const shown = () => text(container, '[data-shown]');
	expect(shown()).toEqual(['0', 'q']);
	press(container, '[data-to-task="p"]');
	await expect.poll(shown).toEqual(['p', 'q']);
	press(container, '[data-to-done="q"]');
	await expect.poll(shown).toEqual(['p', 'done']);
	press(container, '[data-to-note="q"]');
	await expect.poll(shown).toEqual(['p', '1']);
	press(container, '[data-to-done="p"]');
	await expect.poll(shown).toEqual(['done', '1']);
}

test('SSR: a @switch in each row walks its own arms', async () => {
	await checkSwitchRows((await renderSSR(SwitchRowsPage)).container as HTMLElement);
});

test('CSR: a @switch in each row walks its own arms', async () => {
	await checkSwitchRows((await render(SwitchRowsPage)).container as HTMLElement);
});

async function checkIndexRows(container: HTMLElement) {
	const leads = () =>
		Array.from(container.querySelectorAll('li')).map(
			(row) => `${row.getAttribute('data-pick')}:${row.querySelector('.lead, .rest')?.textContent}`,
		);
	expect(leads()).toEqual(['x:first', 'y:1', 'z:2']);
	press(container, '[data-rotate]');
	await expect.poll(leads).toEqual(['z:first', 'x:1', 'y:2']);
	expect(container.querySelectorAll('.wide').length).toBe(3);
	press(container, '[data-compact]');
	await expect.poll(() => container.querySelectorAll('.tight').length).toBe(3);
	expect(container.querySelectorAll('.wide').length).toBe(0);
}

test('SSR: a test over the row index follows a reorder, and one over page state flips every row', async () => {
	await checkIndexRows((await renderSSR(IndexRowsPage)).container as HTMLElement);
});

test('CSR: a test over the row index follows a reorder, and one over page state flips every row', async () => {
	await checkIndexRows((await render(IndexRowsPage)).container as HTMLElement);
});

async function checkConstantRows(container: HTMLElement) {
	const current = () => text(container, '.current');
	expect(current()).toEqual(['One']);
	press(container, '[data-pick="three"]');
	await expect.poll(current).toEqual(['Three']);
	press(container, '[data-pick="one"]');
	await expect.poll(current).toEqual(['One']);
	expect(text(container, '[data-pick]')).toEqual(['Two', 'Three']);
}

test('SSR: rows of a module-constant list flip on page state their @if reads', async () => {
	await checkConstantRows((await renderSSR(ConstantRowsPage)).container as HTMLElement);
});

test('CSR: rows of a module-constant list flip on page state their @if reads', async () => {
	await checkConstantRows((await render(ConstantRowsPage)).container as HTMLElement);
});

async function checkPositionKeyed(container: HTMLElement) {
	press(container, '[data-open="0"]');
	await expect.poll(() => text(container, 'button')).toEqual(['close one', 'close two']);
	press(container, '[data-close="1"]');
	await expect.poll(() => text(container, 'button')).toEqual(['close one', 'open two']);
}

test('SSR: a position-keyed row flips its @if and its handlers act on their own row', async () => {
	await checkPositionKeyed((await renderSSR(PositionKeyedPage)).container as HTMLElement);
});

test('CSR: a position-keyed row flips its @if and its handlers act on their own row', async () => {
	await checkPositionKeyed((await render(PositionKeyedPage)).container as HTMLElement);
});

async function checkNestedRows(container: HTMLElement) {
	expect(text(container, '[data-done]')).toEqual(['g1/t2']);
	press(container, '[data-finish="t3"]');
	await expect.poll(() => text(container, '[data-done]')).toEqual(['g1/t2', 'g2/t3']);
	expect(container.querySelector('[data-marked]')?.textContent).toBe('g2:t3');
	press(container, '[data-finish="t1"]');
	await expect.poll(() => text(container, '[data-done]')).toEqual(['g1/t1', 'g1/t2', 'g2/t3']);
	expect(container.querySelector('[data-marked]')?.textContent).toBe('g1:t1');
}

test('SSR: an @if in a nested row reads the item of the row enclosing it', async () => {
	await checkNestedRows((await renderSSR(NestedRowsPage)).container as HTMLElement);
});

test('CSR: an @if in a nested row reads the item of the row enclosing it', async () => {
	await checkNestedRows((await render(NestedRowsPage)).container as HTMLElement);
});

async function checkGrowRows(container: HTMLElement) {
	const draft = container.querySelector<HTMLInputElement>('[data-draft="n1"]')!;
	draft.value = 'typed';
	press(container, '[data-open="n1"]');
	await expect.poll(() => container.querySelector('[data-shut="n1"]')).not.toBeNull();
	// The row was not rebuilt: its input is the same element, still holding what was typed.
	expect(container.querySelector('[data-draft="n1"]')).toBe(draft);
	expect(draft.value).toBe('typed');
	press(container, '[data-busy]');
	await expect
		.poll(() => container.querySelector('[data-shut="n1"]')?.className)
		.toBe('shut busy');
	press(container, '[data-shut="n1"]');
	await expect.poll(() => container.querySelector('[data-open="n1"]')).not.toBeNull();
}

test('SSR: a flip leaves the rest of its row alone, and the shown arm keeps up with page state', async () => {
	await checkGrowRows((await renderSSR(GrowRowsPage)).container as HTMLElement);
});

test('CSR: a flip leaves the rest of its row alone, and the shown arm keeps up with page state', async () => {
	await checkGrowRows((await render(GrowRowsPage)).container as HTMLElement);
});

async function checkGrownRows(container: HTMLElement) {
	press(container, '[data-add]');
	await expect.poll(() => container.querySelector('[data-open="n2"]')).not.toBeNull();
	press(container, '[data-open="n2"]');
	await expect.poll(() => container.querySelector('[data-shut="n2"]')?.textContent?.trim()).toBe(
		'shut more',
	);
	expect(container.querySelector('[data-open="n1"]')).not.toBeNull();
	press(container, '[data-shut="n2"]');
	await expect.poll(() => container.querySelector('[data-open="n2"]')).not.toBeNull();
}

test('SSR: a row added after load flips its @if and runs its arm handlers', async () => {
	await checkGrownRows((await renderSSR(GrowRowsPage)).container as HTMLElement);
});

test('CSR: a row added after load flips its @if and runs its arm handlers', async () => {
	await checkGrownRows((await render(GrowRowsPage)).container as HTMLElement);
});

// The request class lives for one fake-server delay, so only what each request leaves behind is asserted.
async function checkEditRowDemo(container: HTMLElement) {
	press(container, '[data-edit="1"]');
	await expect.poll(() => container.querySelector('[data-save="1"]')).not.toBeNull();
	expect(container.querySelector('[data-requests]')?.textContent).toBe('1');
	expect(container.querySelector('tr.editing')?.className).toBe('editing');
	const name = container.querySelector<HTMLInputElement>('tr.editing input[name="name"]')!;
	expect(name.value).toBe('Angie');
	name.value = 'Angela';
	press(container, '[data-save="1"]');
	await expect.poll(() => container.querySelector('[data-name="1"]')?.textContent).toBe('Angela');
	expect(container.querySelector('tr.editing')).toBeNull();
	expect(container.querySelector('[data-requests]')?.textContent).toBe('2');
	press(container, '[data-edit="0"]');
	await expect.poll(() => container.querySelector('[data-save="0"]')).not.toBeNull();
	expect(container.querySelector('[data-name="1"]')?.textContent).toBe('Angela');
}

test('SSR: the edit-row demo edits and saves rows that are each an @if', async () => {
	await checkEditRowDemo((await renderSSR(EditRowDemoPage)).container as HTMLElement);
});

test('CSR: the edit-row demo edits and saves rows that are each an @if', async () => {
	await checkEditRowDemo((await render(EditRowDemoPage)).container as HTMLElement);
});

async function checkWrappedComponentRows(container: HTMLElement) {
	press(container, '[data-open="c"]');
	await expect.poll(() => container.querySelector('[data-close="c"]')).not.toBeNull();
	expect(container.querySelector('[data-flipped]')?.textContent).toBe('c');
	press(container, '[data-open="b"]');
	await expect.poll(() => container.querySelector('[data-close="b"]')).not.toBeNull();
	expect(container.querySelector('[data-flipped]')?.textContent).toBe('b');
	expect(container.querySelector('[data-open="a"]')).not.toBeNull();
	press(container, '[data-close="c"]');
	await expect.poll(() => container.querySelector('[data-open="c"]')).not.toBeNull();
}

test('SSR: a component wrapped in a row element flips its @if and calls back with its own row', async () => {
	await checkWrappedComponentRows((await renderSSR(WrappedComponentRowsPage)).container as HTMLElement);
});

test('CSR: a component wrapped in a row element flips its @if and calls back with its own row', async () => {
	await checkWrappedComponentRows((await render(WrappedComponentRowsPage)).container as HTMLElement);
});

async function checkAfterBranchRows(container: HTMLElement) {
	const row = (id: string) => container.querySelector(`[data-line="${id}"]`)!;
	const shape = (id: string) =>
		`${row(id).querySelector('.star, .plain')?.className}:${row(id).querySelector('.label')?.textContent}`;
	press(container, '[data-star="l1"]');
	await expect.poll(() => shape('l1')).toBe('star:first');
	press(container, '[data-rename="l1"]');
	await expect.poll(() => shape('l1')).toBe('star:first!');
	expect(container.querySelector('[data-renamed]')?.textContent).toBe('l1');
	press(container, '[data-rename="l2"]');
	await expect.poll(() => shape('l2')).toBe('star:second!');
	press(container, '[data-star="l2"]');
	await expect.poll(() => shape('l2')).toBe('plain:second!');
	press(container, '[data-rename="l2"]');
	await expect.poll(() => shape('l2')).toBe('plain:second!!');
}

test('SSR: values and handlers after an @if in the same element stay on their own element', async () => {
	await checkAfterBranchRows((await renderSSR(AfterBranchRowsPage)).container as HTMLElement);
});

test('CSR: values and handlers after an @if in the same element stay on their own element', async () => {
	await checkAfterBranchRows((await render(AfterBranchRowsPage)).container as HTMLElement);
});
