import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../src/index.ts';
import Page from './row-outer-read/ror-enclosing.tsrx';

afterEach(() => cleanup());

// A nested row reading the enclosing row's item sees that row's item, not its own.
function snapshot(container: ParentNode) {
	return [...container.querySelectorAll('[data-item]')].map(
		(node) =>
			`${node.getAttribute('data-item')}@${node.getAttribute('data-at')}:${node.getAttribute('title')}:${node.className}:${node.textContent}`,
	);
}

async function enclosingItemResolves(container: HTMLElement) {
	expect(snapshot(container)).toEqual(['p1@0:p:lit:p/p1', 'p2@0:p:lit:p/p2', 'q1@1:q:dim:q/q1']);
	container.querySelector<HTMLButtonElement>('[data-pick-q]')!.click();
	await expect
		.poll(() => snapshot(container))
		.toEqual(['p1@0:p:dim:p/p1', 'p2@0:p:dim:p/p2', 'q1@1:q:lit:q/q1']);
	container.querySelector<HTMLButtonElement>('[data-add-r]')!.click();
	await expect
		.poll(() => snapshot(container))
		.toEqual([
			'p1@0:p:dim:p/p1',
			'p2@0:p:dim:p/p2',
			'q1@1:q:lit:q/q1',
			'r1@2:r:dim:r/r1',
			'r2@2:r:dim:r/r2',
		]);
}

test('CSR: a nested row reads the enclosing row item', async () => {
	const screen = await render(Page);
	await enclosingItemResolves(screen.container as HTMLElement);
});

test('SSR resume: a nested row reads the enclosing row item', async () => {
	const screen = await renderSSR(Page);
	await enclosingItemResolves(screen.container as HTMLElement);
});
