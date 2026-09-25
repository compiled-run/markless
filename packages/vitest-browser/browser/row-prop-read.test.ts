import { afterEach, expect, test, vi } from 'vitest';
import { cleanup, render, renderSSR } from '../src/index.ts';
import Page from './row-outer-read/ror-prop.tsrx';

afterEach(() => {
	cleanup();
	vi.restoreAllMocks();
});

// Rows inside a child component reading one of its props follow the parent state feeding that prop.
function snapshot(container: ParentNode) {
	return [
		...[...container.querySelectorAll('[data-tile]')].map(
			(node) => `${node.getAttribute('data-tile')}:${node.className}:${node.textContent}`,
		),
		...[...container.querySelectorAll('[data-cell]')].map(
			(node) => `${node.getAttribute('data-cell')}:${node.getAttribute('title')}`,
		),
	];
}

function click(container: ParentNode, selector: string) {
	container.querySelector<HTMLButtonElement>(selector)!.click();
}

async function rowsFollowProp(container: HTMLElement) {
	const warn = vi.spyOn(console, 'warn');
	expect(snapshot(container)).toEqual([
		'b-m:hot:yes',
		'b-n:cold:no',
		'live-m:on',
		'live-n:off',
		'fixed-m:off',
		'fixed-n:on',
	]);
	click(container, '[data-choose-n]');
	await expect
		.poll(() => snapshot(container))
		.toEqual([
			'b-m:cold:no',
			'b-n:hot:yes',
			'live-m:off',
			'live-n:on',
			'fixed-m:off',
			'fixed-n:on',
		]);
	click(container, '[data-add-o]');
	await expect
		.poll(() => snapshot(container))
		.toEqual([
			'b-m:cold:no',
			'b-n:hot:yes',
			'b-o:cold:no',
			'live-m:off',
			'live-n:on',
			'live-o:off',
			'fixed-m:off',
			'fixed-n:on',
			'fixed-o:off',
		]);
	click(container, '[data-choose-o]');
	await expect
		.poll(() => snapshot(container))
		.toEqual([
			'b-m:cold:no',
			'b-n:cold:no',
			'b-o:hot:yes',
			'live-m:off',
			'live-n:off',
			'live-o:on',
			'fixed-m:off',
			'fixed-n:on',
			'fixed-o:off',
		]);
	expect(warn.mock.calls.filter(([message]) => String(message).includes('row template'))).toEqual(
		[],
	);
}

test('CSR: rows in a child follow the prop they read', async () => {
	const screen = await render(Page);
	await rowsFollowProp(screen.container as HTMLElement);
});

test('SSR resume: rows in a child follow the prop they read', async () => {
	const screen = await renderSSR(Page);
	await rowsFollowProp(screen.container as HTMLElement);
});
