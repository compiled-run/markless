import { render, renderCsrIslands, renderSSR, renderSSRIslands } from '@markless/vitest-browser';
import { page } from 'vite-plus/test/browser';
import { expect, test } from 'vitest';
import NodeLockToggle from './scenarios/node-lock-toggle.tsrx';

function el<T extends Element = HTMLElement>(locator: { element(): Element | null }) {
	const found = locator.element();
	if (!found) throw new Error('Expected the part to be on the page.');
	return found as T;
}

const rows = ['src', 'docs'] as const;
const locks = () =>
	rows.map((name) => ({
		name,
		row: el(page.getByTestId(`${name}-item`)).getAttribute('aria-disabled'),
		trigger: el<HTMLButtonElement>(page.getByTestId(`${name}-itemtrigger`)).disabled,
	}));
const lockedOnly = (...locked: ReadonlyArray<string>) =>
	rows.map((name) => ({
		name,
		row: locked.includes(name) ? 'true' : null,
		trigger: locked.includes(name),
	}));

const mounts = {
	CSR: () => render(NodeLockToggle),
	SSR: () => renderSSR(NodeLockToggle),
	'SSR island': () => renderSSRIslands([NodeLockToggle]),
	'CSR island': () => renderCsrIslands([NodeLockToggle]),
} as const;

for (const mode of Object.keys(mounts) as Array<keyof typeof mounts>) {
	test(`${mode}: locking one node after the tree is live locks that node alone`, async () => {
		await mounts[mode]();
		expect(locks()).toEqual(lockedOnly());

		el(page.getByTestId('lock-docs')).click();
		await expect.poll(locks).toEqual(lockedOnly('docs'));

		el(page.getByTestId('lock-docs')).click();
		await expect.poll(locks).toEqual(lockedOnly());

		el(page.getByTestId('lock-src')).click();
		await expect.poll(locks).toEqual(lockedOnly('src'));

		el(page.getByTestId('lock-docs')).click();
		await expect.poll(locks).toEqual(lockedOnly('src', 'docs'));

		el(page.getByTestId('lock-src')).click();
		await expect.poll(locks).toEqual(lockedOnly('docs'));

		el(page.getByTestId('lock-docs')).click();
		await expect.poll(locks).toEqual(lockedOnly());
	});

	test(`${mode}: closing a node and locking the whole tree leave every node to its own state`, async () => {
		await mounts[mode]();

		el(page.getByTestId('open-src')).click();
		await expect
			.poll(() => el(page.getByTestId('src-item')).getAttribute('aria-expanded'))
			.toBe('false');
		expect(locks()).toEqual(lockedOnly());

		el(page.getByTestId('lock-docs')).click();
		await expect.poll(locks).toEqual(lockedOnly('docs'));

		el(page.getByTestId('lock-all')).click();
		await expect.poll(() => locks().map((lock) => lock.trigger)).toEqual([true, true]);
		el(page.getByTestId('lock-all')).click();
		await expect.poll(locks).toEqual(lockedOnly('docs'));

		el(page.getByTestId('lock-docs')).click();
		await expect.poll(locks).toEqual(lockedOnly());
		el(page.getByTestId('src-itemtrigger')).click();
		await expect
			.poll(() => el(page.getByTestId('src-item')).getAttribute('aria-expanded'))
			.toBe('true');
		expect(el(page.getByTestId('last')).textContent).toBe('src opened');
	});
}
