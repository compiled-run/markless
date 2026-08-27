import { cleanup, render, renderSSR } from '@markless/vitest-browser';
import { afterEach, expect, test } from 'vitest';
import SecondReaderPage from './second-reader.tsrx';
import SoleReaderPage from './sole-reader.tsrx';

// A part seeds a family cell from its own `children`; a sibling reads that cell in
// an attribute. Writing the value the consumer passed has to reach both the seeded
// cell and the part's own projection of those children. `sole-reader` is the page
// where the seed is the write's only consumer; `second-reader` adds one unrelated
// reader of the same value, which must change nothing.
afterEach(() => cleanup());

function one(container: ParentNode, selector: string) {
	const found = container.querySelector(selector);
	if (!found) throw new Error(`Expected "${selector}" on the page.`);
	return found;
}

function text(container: ParentNode, selector: string) {
	return one(container, selector).textContent?.trim();
}

function advance(container: ParentNode) {
	(one(container, '[data-advance]') as HTMLButtonElement).click();
}

for (const mode of ['CSR', 'SSR'] as const) {
	test(`${mode}: a write whose only consumer is a seeded cell reaches the sibling reading it`, async () => {
		const screen =
			mode === 'CSR' ? await render(SoleReaderPage) : await renderSSR(SoleReaderPage);
		const container = screen.container as ParentNode;
		expect(one(container, '[data-gauge-bar]').getAttribute('aria-valuetext')).toBe(
			'30 of 100 rows',
		);

		advance(container);
		await expect
			.poll(() => one(container, '[data-gauge-bar]').getAttribute('aria-valuetext'))
			.toBe('60 of 100 rows');
	});

	test(`${mode}: a bare projection of the changed children prop re-renders`, async () => {
		const screen =
			mode === 'CSR' ? await render(SoleReaderPage) : await renderSSR(SoleReaderPage);
		const container = screen.container as ParentNode;
		expect(text(container, '[data-gauge-note]')).toBe('30 of 100 rows');

		advance(container);
		await expect.poll(() => text(container, '[data-gauge-note]')).toBe('60 of 100 rows');
	});

	test(`${mode}: an unrelated reader of the same value changes neither`, async () => {
		const screen =
			mode === 'CSR' ? await render(SecondReaderPage) : await renderSSR(SecondReaderPage);
		const container = screen.container as ParentNode;

		advance(container);
		await expect.poll(() => text(container, '[data-amount]')).toBe('60 of 100 rows');
		expect(one(container, '[data-gauge-bar]').getAttribute('aria-valuetext')).toBe(
			'60 of 100 rows',
		);
		expect(text(container, '[data-gauge-note]')).toBe('60 of 100 rows');
	});

	// The arm's text comes from the branch-update symbol's OWN read of the part-local
	// `children` prop, which the rewritten record reads never touch: the served branch
	// record carries the child's prop route table so that read reaches the caller's
	// node too. The bare projection above is the control - it follows the record.
	test(`${mode}: an arm projection of the changed children prop re-renders`, async () => {
		const screen =
			mode === 'CSR' ? await render(SoleReaderPage) : await renderSSR(SoleReaderPage);
		const container = screen.container as ParentNode;
		expect(text(container, '[data-gauge-caption]')).toBe('30 of 100 rows');

		advance(container);
		await expect.poll(() => text(container, '[data-gauge-note]')).toBe('60 of 100 rows');
		expect(text(container, '[data-gauge-caption]')).toBe('60 of 100 rows');
	});
}
