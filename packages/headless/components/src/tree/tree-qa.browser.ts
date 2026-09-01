import { render } from '@markless/vitest-browser';
import { page, userEvent } from 'vite-plus/test/browser';
import { expect, test } from 'vitest';
import Nested from './scenarios/nested.tsrx';
import Unavailable from './scenarios/unavailable.tsrx';

const Root = page.getByTestId('root');
const SrcItem = page.getByTestId('src-item');
const SrcTrigger = page.getByTestId('src-itemtrigger');
const SrcContent = page.getByTestId('src-itemcontent');
const IndexItem = page.getByTestId('index-item');
const AppItem = page.getByTestId('app-item');
const ReadmeItem = page.getByTestId('readme-item');
const DocsItem = page.getByTestId('docs-item');
const DocsContent = page.getByTestId('docs-itemcontent');

function el<T extends Element = HTMLElement>(locator: { element(): Element | null }) {
	const found = locator.element();
	if (!found) throw new Error('Expected the part to be on the page.');
	return found as T;
}

// The root's keyboard is the whole of this family's navigation, and every one of
// these rows walks it. A closed group stays in the page rather than detaching, so
// "which rows may an arrow reach" is a containment test the walk has to get right.

test('CSR: focus reaching the tree lands on the first row', async () => {
	await render(Nested);
	el(Root).focus();

	await expect.poll(() => document.activeElement).toBe(el(SrcItem));
	await expect.poll(() => el(Root).getAttribute('tabindex')).toBe('-1');
	await expect.poll(() => el(SrcItem).getAttribute('tabindex')).toBe('0');
	await expect.poll(() => el(ReadmeItem).getAttribute('tabindex')).toBe('-1');
});

test('CSR: the arrows walk only the rows a closed group is not hiding', async () => {
	await render(Nested);
	el(SrcItem).focus();

	// index.ts and app.tsrx sit inside the hidden group, so the walk never meets them.
	await userEvent.keyboard('{ArrowDown}');
	await expect.poll(() => document.activeElement).toBe(el(ReadmeItem));
	expect(el(SrcContent).hasAttribute('hidden')).toBe(true);

	await userEvent.keyboard('{ArrowUp}');
	await expect.poll(() => document.activeElement).toBe(el(SrcItem));
});

test('CSR: the ends of the tree stay put', async () => {
	await render(Nested);
	el(SrcItem).focus();

	await userEvent.keyboard('{ArrowUp}');
	await expect.poll(() => document.activeElement).toBe(el(SrcItem));
	el(ReadmeItem).focus();
	await userEvent.keyboard('{ArrowDown}');
	await expect.poll(() => document.activeElement).toBe(el(ReadmeItem));
});

test('CSR: Home and End reach the first and last row a person can see', async () => {
	await render(Nested);
	el(ReadmeItem).focus();

	await userEvent.keyboard('{Home}');
	await expect.poll(() => document.activeElement).toBe(el(SrcItem));
	await userEvent.keyboard('{End}');
	await expect.poll(() => document.activeElement).toBe(el(ReadmeItem));
});

test('CSR: ArrowRight opens a closed node and then steps into it', async () => {
	await render(Nested);
	el(SrcItem).focus();

	await userEvent.keyboard('{ArrowRight}');
	await expect.poll(() => el(SrcItem).getAttribute('aria-expanded')).toBe('true');
	// The first press only opens: focus stays on the node that opened.
	expect(document.activeElement).toBe(el(SrcItem));

	await userEvent.keyboard('{ArrowRight}');
	await expect.poll(() => document.activeElement).toBe(el(IndexItem));
});

test('CSR: ArrowLeft closes an open node and climbs out of a child', async () => {
	await render(Nested);
	el(SrcItem).focus();
	await userEvent.keyboard('{ArrowRight}');
	await expect.poll(() => el(SrcItem).getAttribute('aria-expanded')).toBe('true');

	el(AppItem).focus();
	await userEvent.keyboard('{ArrowLeft}');
	await expect.poll(() => document.activeElement).toBe(el(SrcItem));

	await userEvent.keyboard('{ArrowLeft}');
	await expect.poll(() => el(SrcItem).hasAttribute('aria-expanded')).toBe(false);
});

test('CSR: Enter on the row opens the node its trigger would', async () => {
	await render(Nested);
	el(SrcItem).focus();

	await userEvent.keyboard('{Enter}');
	await expect.poll(() => el(SrcItem).getAttribute('aria-expanded')).toBe('true');
	// Once, not twice: the trigger inside the row is a native button and the row
	// only reaches it when the key landed on the row itself.
	expect(el(SrcContent).hasAttribute('hidden')).toBe(false);
});

test('CSR: a letter jumps to the next row that reads that way', async () => {
	await render(Nested);
	el(SrcItem).focus();

	await userEvent.keyboard('r');
	await expect.poll(() => document.activeElement).toBe(el(ReadmeItem));
});

test('CSR: a tree nobody may change never opens or closes from the keyboard', async () => {
	await render(Unavailable);
	el(SrcItem).focus();

	// Every path the root's keyboard has into a node goes through the node's own
	// trigger, and a disabled native button refuses a synthetic press.
	await userEvent.keyboard('{ArrowRight}');
	await expect.poll(() => el(SrcItem).hasAttribute('aria-expanded')).toBe(false);
	await userEvent.keyboard('{Enter}');
	await expect.poll(() => el(SrcItem).hasAttribute('aria-expanded')).toBe(false);
	expect(el(SrcTrigger).hasAttribute('disabled')).toBe(true);

	el(DocsItem).focus();
	await userEvent.keyboard('{ArrowLeft}');
	await expect.poll(() => el(DocsItem).getAttribute('aria-expanded')).toBe('true');
	expect(el(DocsContent).hasAttribute('hidden')).toBe(false);
});
