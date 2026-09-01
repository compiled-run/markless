import { render } from '@markless/vitest-browser';
import { page, userEvent } from 'vite-plus/test/browser';
import { expect, test } from 'vitest';
import DisabledRow from './scenarios/disabled-row.tsrx';

const ReadmeItem = page.getByTestId('readme-item');
const ReadmeName = page.getByTestId('readme-name');
const LicenseItem = page.getByTestId('license-item');
const LicenseName = page.getByTestId('license-name');
const ChangelogItem = page.getByTestId('changelog-item');

function el<T extends Element = HTMLElement>(locator: { element(): Element | null }) {
	const found = locator.element();
	if (!found) throw new Error('Expected the part to be on the page.');
	return found as T;
}

// A `<tr>` carries no native `disabled`, so nothing but the family's own
// predicate keeps a press or a space bar off a row nobody may reach. The walk
// already steps over it, which is what says the family means it.

test('CSR: a press on a row nobody may reach picks nothing', async () => {
	await render(DisabledRow);
	el(LicenseName).click();

	await expect.poll(() => el(LicenseItem).getAttribute('aria-selected')).toBe('false');
	expect(el(LicenseItem).hasAttribute('ui-selected')).toBe(false);

	el(ReadmeName).click();
	await expect.poll(() => el(ReadmeItem).getAttribute('aria-selected')).toBe('true');
});

test('CSR: the space bar on a row nobody may reach picks nothing', async () => {
	await render(DisabledRow);
	el<HTMLElement>(LicenseName).focus();

	await userEvent.keyboard(' ');
	await expect.poll(() => el(LicenseItem).getAttribute('aria-selected')).toBe('false');
	expect(el(LicenseItem).hasAttribute('ui-selected')).toBe(false);
});

test('CSR: Control+A picks every row a person may reach and no others', async () => {
	await render(DisabledRow);
	el<HTMLElement>(ReadmeItem).focus();

	await userEvent.keyboard('{Control>}a{/Control}');
	await expect.poll(() => el(ReadmeItem).getAttribute('aria-selected')).toBe('true');
	await expect.poll(() => el(ChangelogItem).getAttribute('aria-selected')).toBe('true');
	expect(el(LicenseItem).getAttribute('aria-selected')).toBe('false');
});

test('CSR: the arrow walk steps over a row nobody may reach', async () => {
	await render(DisabledRow);
	el<HTMLElement>(ReadmeItem).focus();

	await userEvent.keyboard('{ArrowDown}');
	await expect.poll(() => document.activeElement).toBe(el(ChangelogItem));
	await userEvent.keyboard('{ArrowUp}');
	await expect.poll(() => document.activeElement).toBe(el(ReadmeItem));
});
