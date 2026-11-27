import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR, renderSSRPhased } from '../src/index.ts';
import Page from './fixtures/prop-defaults-page.tsrx';

afterEach(() => cleanup());

function stars(container: ParentNode, name: string) {
	const host = container.querySelector(`[data-case="${name}"]`);
	if (!host) throw new Error(`Expected case "${name}".`);
	return {
		size: host.querySelector('[data-stars]')?.getAttribute('data-size'),
		row: host.querySelector('[data-row]')?.textContent,
		label: host.querySelector('[data-label]')?.textContent,
		big: host.querySelector('[data-big]') !== null,
		pick: host.querySelector<HTMLButtonElement>('[data-pick]')!,
		picked: () => host.querySelector('[data-picked]')?.textContent,
	};
}

function button(container: ParentNode, selector: string) {
	const found = container.querySelector<HTMLButtonElement>(selector);
	if (!found) throw new Error(`Expected ${selector}.`);
	return found;
}

function tags(container: ParentNode, name: string) {
	return [...container.querySelectorAll(`[data-case="${name}"] li`)].map(
		(item) => item.textContent,
	);
}

function rowStars(container: ParentNode) {
	return [...container.querySelectorAll('[data-case="rows"] [data-row]')].map(
		(row) => row.textContent,
	);
}

function expectFirstPaint(container: ParentNode) {
	expect(rowStars(container)).toEqual(['★★', '★★★']);
	expect(tags(container, 'tags-omitted')).toEqual(['x', 'y']);
	expect(tags(container, 'tags-passed')).toEqual(['a']);
	for (const name of ['omitted', 'undefined']) {
		expect(stars(container, name), name).toMatchObject({
			size: '3',
			row: '★★★',
			label: '3 stars',
			big: false,
		});
	}
	expect(stars(container, 'passed')).toMatchObject({
		size: '5',
		row: '★★★★★',
		label: '5 stars',
		big: true,
	});
	expect(stars(container, 'live')).toMatchObject({ size: '1', row: '★', label: '1 stars' });
}

async function expectLive(container: ParentNode) {
	stars(container, 'omitted').pick.click();
	await expect.poll(() => stars(container, 'omitted').picked()).toBe('3');
	stars(container, 'passed').pick.click();
	await expect.poll(() => stars(container, 'passed').picked()).toBe('5');

	button(container, '[data-more]').click();
	await expect
		.poll(() => stars(container, 'live'))
		.toMatchObject({ size: '6', row: '★★★★★★', label: '6 stars', big: true });
	await expect.poll(() => tags(container, 'tags-passed')).toEqual(['a', 'b', 'c']);
	await expect.poll(() => rowStars(container)).toEqual(['★★', '★']);

	button(container, '[data-clear]').click();
	await expect
		.poll(() => stars(container, 'live'))
		.toMatchObject({ size: '3', row: '★★★', label: '3 stars', big: false });
	await expect.poll(() => tags(container, 'tags-passed')).toEqual(['a', 'b']);
	stars(container, 'live').pick.click();
	await expect.poll(() => stars(container, 'live').picked()).toBe('3');
}

test('CSR: a prop default shows when the prop is omitted or undefined, and stays live', async () => {
	const screen = await render(Page);
	const container = screen.container as HTMLElement;
	expectFirstPaint(container);
	await expectLive(container);
});

test('SSR: the server HTML carries the defaults, and the mount agrees', async () => {
	const phased = await renderSSRPhased(Page);
	expect(phased.html).toContain('data-size="3"');
	expect(phased.html).toContain('★★★★★');
	expectFirstPaint(phased.mount().container);
});

test('SSR resume: the defaults survive resume and every reader keeps them', async () => {
	const screen = await renderSSR(Page);
	expectFirstPaint(screen.container);
	await expectLive(screen.container);
});
