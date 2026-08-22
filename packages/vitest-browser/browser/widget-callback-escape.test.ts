import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../src/index.ts';
import Page from './fixtures/wcb-page.tsrx';

// T075: a widget callback slot's dispatch has to LEAVE the widget. The part is
// placed inside the composed root by the enclosing family's own composition, so
// the handler that answers the slot is the enclosing part's — running on the
// enclosing part's instance, not on the widget's.
afterEach(() => cleanup());

function groups(container: ParentNode) {
	return {
		triggers: [...container.querySelectorAll<HTMLButtonElement>('[data-wcb-trigger]')],
		counts: [...container.querySelectorAll('[data-grp-count]')],
		lasts: [...container.querySelectorAll('[data-grp-last]')],
	};
}

async function expectDispatchReachesTheEnclosingGroup(container: ParentNode) {
	const { triggers, counts, lasts } = groups(container);
	expect(triggers.length).toBe(2);
	expect(counts.map((count) => count.textContent)).toEqual(['0', '0']);
	expect(lasts.map((last) => last.textContent)).toEqual(['none', 'none']);

	triggers[1]?.click();
	await expect
		.poll(() => groups(container).counts.map((count) => count.textContent))
		.toEqual(['0', '1']);
	expect(groups(container).lasts.map((last) => last.textContent)).toEqual(['none', 'on']);

	triggers[1]?.click();
	await expect
		.poll(() => groups(container).lasts.map((last) => last.textContent))
		.toEqual(['none', 'off']);
	expect(groups(container).counts.map((count) => count.textContent)).toEqual(['0', '2']);

	triggers[0]?.click();
	await expect
		.poll(() => groups(container).counts.map((count) => count.textContent))
		.toEqual(['1', '2']);
}

// T075d: the slot is a graph node of the widget's own definition, valued at
// compose from the callbacks map the composing edge already hands the root, and
// read at invoke time through the instance-qualified graph. Both halves of the
// same node, so CSR and SSR resume answer alike.
test('CSR: a composed part dispatches to the enclosing family root that placed it', async () => {
	const screen = await render(Page);
	await expectDispatchReachesTheEnclosingGroup(screen.container as HTMLElement);
});

test('SSR resume: the same dispatch reaches the same enclosing group', async () => {
	const screen = await renderSSR(Page);
	await expectDispatchReachesTheEnclosingGroup(screen.container);
});
