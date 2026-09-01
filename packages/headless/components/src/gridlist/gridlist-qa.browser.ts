import { render } from '@markless/vitest-browser';
import { page, userEvent } from 'vite-plus/test/browser';
import { expect, test } from 'vitest';
import DisabledRow from './scenarios/disabled-row.tsrx';

const Root = page.getByTestId('root');
const ReadmeItem = page.getByTestId('readme-item');
const LicenseItem = page.getByTestId('license-item');
const LicenseLabel = page.getByTestId('license-itemlabel');
const ChangelogItem = page.getByTestId('changelog-item');

function el<T extends Element = HTMLElement>(locator: { element(): Element | null }) {
	const found = locator.element();
	if (!found) throw new Error('Expected the part to be on the page.');
	return found as T;
}

// A row is a plain element: it carries no native `disabled`, so nothing but the
// family's own predicate keeps a press or a space bar off a row nobody may reach.
// The arrow walk already steps over it, which is what says the family means it.

test('CSR: a press on a row nobody may reach picks nothing', async () => {
	await render(DisabledRow);
	el(LicenseLabel).click();

	await expect.poll(() => el(LicenseItem).getAttribute('aria-selected')).toBe('false');
	expect(el(LicenseItem).hasAttribute('ui-selected')).toBe(false);

	// The row beside it still picks, so the refusal is the row's and not the list's.
	el(ReadmeItem).click();
	await expect.poll(() => el(ReadmeItem).getAttribute('aria-selected')).toBe('true');
});

test('CSR: the space bar on a row nobody may reach picks nothing', async () => {
	await render(DisabledRow);
	// A press lands focus on the row even though the walk never would, so the
	// space bar can reach it from there.
	el<HTMLElement>(LicenseItem).focus();

	await userEvent.keyboard(' ');
	await expect.poll(() => el(LicenseItem).getAttribute('aria-selected')).toBe('false');
	expect(el(LicenseItem).hasAttribute('ui-selected')).toBe(false);
});

test('CSR: Home and End never stop on a row nobody may reach', async () => {
	await render(DisabledRow);
	el(ReadmeItem).focus();

	await userEvent.keyboard('{End}');
	await expect.poll(() => document.activeElement).toBe(el(ChangelogItem));
	await userEvent.keyboard('{Home}');
	await expect.poll(() => document.activeElement).toBe(el(ReadmeItem));
	expect(document.activeElement).not.toBe(el(LicenseItem));
	expect(el(Root).getAttribute('role')).toBe('grid');
});
