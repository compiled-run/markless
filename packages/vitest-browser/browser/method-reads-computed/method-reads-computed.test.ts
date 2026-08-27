import { cleanup, render, renderSSR } from '@markless/vitest-browser';
import { afterEach, expect, test } from 'vitest';
import TallyPage from './tally-page.tsrx';
import TwoRootsPage from './two-roots-page.tsrx';

// A shared() method that reads a computed declared beside it in the same factory.
// On a served page that read used to answer the factory's initial value rather
// than the resumed one, so the append built a one-element list and each gesture
// silently replaced the previous one instead of adding to it. The `addViaCells`
// rows are the control: the same append written off the cells.
afterEach(() => cleanup());

function one(container: ParentNode, selector: string) {
	const found = container.querySelector(selector);
	if (!found) throw new Error(`Expected "${selector}" on the page.`);
	return found;
}

function readout(container: ParentNode) {
	return one(container, '[data-tally-readout]').textContent?.trim();
}

for (const mode of ['CSR', 'SSR'] as const) {
	test(`${mode}: a method reading a factory computed appends to the seeded list`, async () => {
		const screen = mode === 'CSR' ? await render(TallyPage) : await renderSSR(TallyPage);
		const container = screen.container as ParentNode;
		expect(readout(container)).toBe('a');

		(one(container, '[data-tally-area]') as HTMLElement).click();
		await expect.poll(() => readout(container)).toBe('a|x');

		(one(container, '[data-tally-area]') as HTMLElement).click();
		await expect.poll(() => readout(container)).toBe('a|x|x');
	});

	test(`${mode}: the same append written off the cells agrees with it`, async () => {
		const screen = mode === 'CSR' ? await render(TallyPage) : await renderSSR(TallyPage);
		const container = screen.container as ParentNode;

		(one(container, '[data-tally-control]') as HTMLElement).click();
		await expect.poll(() => readout(container)).toBe('a|y');

		(one(container, '[data-tally-control]') as HTMLElement).click();
		await expect.poll(() => readout(container)).toBe('a|y|y');
	});

	test(`${mode}: an attribute over a computed the method also reads follows the write`, async () => {
		const screen = mode === 'CSR' ? await render(TallyPage) : await renderSSR(TallyPage);
		const container = screen.container as ParentNode;
		expect(one(container, '[data-tally-area]').getAttribute('ui-count')).toBe('1');

		(one(container, '[data-tally-area]') as HTMLElement).click();
		await expect
			.poll(() => one(container, '[data-tally-area]').getAttribute('ui-count'))
			.toBe('2');
	});

	// The served value lands in the widget root's own payload record, so two roots
	// on one page have to answer their own seed rather than share one snapshot.
	test(`${mode}: each widget instance's method reads its own seeded list`, async () => {
		const screen = mode === 'CSR' ? await render(TwoRootsPage) : await renderSSR(TwoRootsPage);
		const container = screen.container as ParentNode;
		const first = one(container, '[data-first]') as ParentNode;
		const second = one(container, '[data-second]') as ParentNode;
		expect(readout(first)).toBe('a');
		expect(readout(second)).toBe('p|q');

		(one(second, '[data-tally-area]') as HTMLElement).click();
		await expect.poll(() => readout(second)).toBe('p|q|x');
		expect(readout(first)).toBe('a');

		(one(first, '[data-tally-area]') as HTMLElement).click();
		await expect.poll(() => readout(first)).toBe('a|x');
		expect(readout(second)).toBe('p|q|x');
	});
}
