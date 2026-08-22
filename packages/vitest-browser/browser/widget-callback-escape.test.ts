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

// Pinned on the open defect (T075): the claim is resolved in the module that
// composes the part, and that module cannot know which of ITS roots encloses the
// part — only the consumer's nesting says. Measured: the route folds to
// `compiler-known-constant undefined` in wcb-group.tsrx and the dispatch no-ops
// on both CSR and SSR resume. The design memo is in
// packages/headless/components/src/checklist/note.md.
test.skip('CSR: a composed part dispatches to the enclosing family root that placed it', async () => {
	const screen = await render(Page);
	await expectDispatchReachesTheEnclosingGroup(screen.container as HTMLElement);
});

test.skip('SSR resume: the same dispatch reaches the same enclosing group', async () => {
	const screen = await renderSSR(Page);
	await expectDispatchReachesTheEnclosingGroup(screen.container);
});
