import { cleanup, render, renderSSR } from '@markless/vitest-browser';
import { afterEach, expect, test } from 'vitest';
import GroupsPage from './groups-page.tsrx';

// An outer row added after load builds the rows of the @for inside it, and they answer their handlers.
afterEach(() => cleanup());

const buttons = (container: ParentNode) =>
	[...container.querySelectorAll('section')].map((section) =>
		[...section.querySelectorAll('button')].map((button) => button.textContent?.trim()).join(','),
	);

const press = (container: ParentNode, label: string) => {
	const button = [...container.querySelectorAll('button')].find((each) => each.textContent?.trim() === label);
	if (!button) throw new Error(`Expected a ${label} button on the page.`);
	button.click();
};

for (const mode of ['SSR', 'CSR'] as const) {
	test(`${mode}: an outer row added after load renders its inner rows`, async () => {
		const { container } = await (mode === 'SSR' ? renderSSR(GroupsPage) : render(GroupsPage));
		container.querySelector<HTMLButtonElement>('#add')!.click();
		await expect.poll(() => buttons(container)[2]).toBe('Drop Nuts Pecan,Add to Nuts');
		press(container, 'Add to Nuts');
		await expect.poll(() => buttons(container)[2]).toBe('Drop Nuts Pecan,Drop Nuts Plum,Add to Nuts');
		press(container, 'Drop Nuts Pecan');
		await expect.poll(() => buttons(container)[2]).toBe('Drop Nuts Plum,Add to Nuts');
		expect(buttons(container).slice(0, 2)).toEqual([
			'Drop Fruit Apple,Drop Fruit Pear,Add to Fruit',
			'Drop Veg Kale,Add to Veg',
		]);
	});
}
