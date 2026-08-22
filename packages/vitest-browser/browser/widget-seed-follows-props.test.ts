import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../src/index.ts';
import Page from './fixtures/wsf-page.tsrx';

// T075g, the return leg: a composed child's edge prop is a graph reference, so
// the enclosing instance's write has to re-run the child's own seed and land in
// the child's seeded cell. Nothing is sensed — the child module declares which
// prop reads its seed follows, and composition remaps those reads onto the
// parent's routes the way it already remaps a computed's dependencies.
afterEach(() => cleanup());

function parts(container: ParentNode) {
	return {
		triggers: [...container.querySelectorAll<HTMLButtonElement>('[data-wcb-trigger]')],
		all: [...container.querySelectorAll<HTMLButtonElement>('[data-wsf-all]')],
		none: [...container.querySelectorAll<HTMLButtonElement>('[data-wsf-none]')],
	};
}

async function expectTheGroupsWriteReachesTheComposedWidget(container: ParentNode) {
	expect(parts(container).triggers.map((trigger) => trigger.textContent)).toEqual([
		'false',
		'false',
	]);

	parts(container).all[1]?.click();
	await expect
		.poll(() => parts(container).triggers.map((trigger) => trigger.textContent))
		.toEqual(['false', 'true']);

	parts(container).none[1]?.click();
	await expect
		.poll(() => parts(container).triggers.map((trigger) => trigger.textContent))
		.toEqual(['false', 'false']);

	parts(container).all[0]?.click();
	await expect
		.poll(() => parts(container).triggers.map((trigger) => trigger.textContent))
		.toEqual(['true', 'false']);
}

// Last write wins between the two channels: the part writes the same cell the
// seed does, so its own toggle stands over a seeded value until the group moves
// the prop again.
async function expectThePartsOwnToggleStillWrites(container: ParentNode) {
	parts(container).all[0]?.click();
	await expect
		.poll(() => parts(container).triggers.map((trigger) => trigger.textContent))
		.toEqual(['true', 'false']);

	parts(container).triggers[0]?.click();
	await expect
		.poll(() => parts(container).triggers.map((trigger) => trigger.textContent))
		.toEqual(['false', 'false']);

	parts(container).none[0]?.click();
	parts(container).all[0]?.click();
	await expect
		.poll(() => parts(container).triggers.map((trigger) => trigger.textContent))
		.toEqual(['true', 'false']);
}

test('CSR: an enclosing instance write re-seeds the composed widget it placed', async () => {
	const screen = await render(Page);
	await expectTheGroupsWriteReachesTheComposedWidget(screen.container as HTMLElement);
});

test('CSR: the composed part keeps writing the same cell, last write wins', async () => {
	const screen = await render(Page);
	await expectThePartsOwnToggleStillWrites(screen.container as HTMLElement);
});

test('SSR resume: the same write reaches the same composed widget', async () => {
	const screen = await renderSSR(Page);
	await expectTheGroupsWriteReachesTheComposedWidget(screen.container);
});

test('SSR resume: the composed part keeps writing the same cell', async () => {
	const screen = await renderSSR(Page);
	await expectThePartsOwnToggleStillWrites(screen.container);
});
