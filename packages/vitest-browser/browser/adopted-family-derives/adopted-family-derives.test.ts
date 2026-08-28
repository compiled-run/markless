import { cleanup, render, renderSSR } from '@markless/vitest-browser';
import { afterEach, expect, test } from 'vitest';
import EnclosingPage from './enclosing-page.tsrx';
import OutermostPage from './outermost-page.tsrx';
import OutermostPartPage from './outermost-part-page.tsrx';
import OutermostSecondPartPage from './outermost-second-part-page.tsrx';
import TwoPanelsPage from './two-panels-page.tsrx';

// Who owns the page-space nodes of a widget family a module only IMPORTED. Both
// directions are measured here, because they pull against each other: an
// outermost adopter must own the family's nodes or its computed never re-derives
// after a write, and an adopting part inside a rendered root must own none of
// them or it composes as a second root and the two rosters merge.
afterEach(() => cleanup());

function panels(container: ParentNode) {
	return [...container.querySelectorAll<HTMLElement>('[data-panel]')];
}

function marks(container: ParentNode) {
	return [...container.querySelectorAll<HTMLElement>('[data-mark]')];
}

function markLoud(container: ParentNode) {
	return marks(container).map((mark) => mark.getAttribute('data-mark-loud'));
}

function clickMark(container: ParentNode, name: string) {
	container.querySelector<HTMLButtonElement>(`[data-mark][data-name="${name}"]`)?.click();
}

// Every probe fires, then the rosters are read back off the cell each one wrote.
async function rosters(container: ParentNode) {
	for (const button of container.querySelectorAll<HTMLButtonElement>('[data-probe]'))
		button.click();
	await expect
		.poll(() =>
			[...container.querySelectorAll<HTMLElement>('[data-roster]')].every(
				(host) => host.getAttribute('data-roster') !== '',
			),
		)
		.toBe(true);
	return [...container.querySelectorAll<HTMLElement>('[data-roster]')].map((host) =>
		host.getAttribute('data-roster'),
	);
}

/** The outermost adopter's own write must re-derive the family's computed. */
async function expectOutermostPageReDerives(container: ParentNode) {
	await expect.poll(() => container.querySelector('[data-page-loud]')?.textContent).toBe('QUIET');
	container.querySelector<HTMLButtonElement>('[data-write]')?.click();
	await expect.poll(() => container.querySelector('[data-page-loud]')?.textContent).toBe('LOUDER');
}

/** The same, written from the adopting PART the outermost page composes. */
async function expectOutermostPartReDerives(container: ParentNode) {
	await expect.poll(() => markLoud(container)).toEqual(['QUIET']);
	clickMark(container, 'louder');
	await expect.poll(() => markLoud(container)).toEqual(['LOUDER']);
}

/** A part's write re-derives inside the instance the enclosing root opened. */
async function expectEnclosedReDerives(container: ParentNode) {
	await expect.poll(() => markLoud(container)).toEqual(['QUIET', 'QUIET', 'QUIET']);
	await expect
		.poll(() => panels(container).map((panel) => panel.getAttribute('data-panel-loud')))
		.toEqual(['QUIET']);
	clickMark(container, 'a');
	await expect.poll(() => markLoud(container)).toEqual(['A', 'A', 'A']);
	await expect
		.poll(() => panels(container).map((panel) => panel.getAttribute('data-panel-loud')))
		.toEqual(['A']);
}

/** Two rendered instances stay two: separate derives, separate rosters. */
async function expectPanelsStaySeparate(container: ParentNode) {
	clickMark(container, 'a');
	await expect
		.poll(() => panels(container).map((panel) => panel.getAttribute('data-panel-loud')))
		.toEqual(['A', 'QUIET']);
	await expect.poll(() => markLoud(container)).toEqual(['A', 'A', 'QUIET']);
	expect(await rosters(container)).toEqual(['a,b', 'c']);
}

test('CSR: an outermost page adopting a handle-carrying family re-derives its computed', async () => {
	const screen = await render(OutermostPage);
	await expectOutermostPageReDerives(screen.container as HTMLElement);
});

test('SSR resume: an outermost page adopting a handle-carrying family re-derives its computed', async () => {
	const screen = await renderSSR(OutermostPage);
	await expectOutermostPageReDerives(screen.container);
});

test('CSR: the outermost page files its own element() handle', async () => {
	const screen = await render(OutermostPage);
	expect(await rosters(screen.container as HTMLElement)).toEqual(['a']);
});

test('SSR resume: the outermost page files its own element() handle', async () => {
	const screen = await renderSSR(OutermostPage);
	expect(await rosters(screen.container)).toEqual(['a']);
});

test('CSR: an adopting part with nothing enclosing it re-derives its computed', async () => {
	const screen = await render(OutermostPartPage);
	await expectOutermostPartReDerives(screen.container as HTMLElement);
});

test('SSR resume: an adopting part with nothing enclosing it re-derives its computed', async () => {
	const screen = await renderSSR(OutermostPartPage);
	await expectOutermostPartReDerives(screen.container);
});

test('CSR: an adopting part that is not its module’s first export re-derives', async () => {
	const screen = await render(OutermostSecondPartPage);
	await expectOutermostPartReDerives(screen.container as HTMLElement);
});

test('SSR resume: an adopting part that is not its module’s first export re-derives', async () => {
	const screen = await renderSSR(OutermostSecondPartPage);
	await expectOutermostPartReDerives(screen.container);
});

test('CSR: an adopting part inside a rooted instance re-derives in that instance', async () => {
	const screen = await render(EnclosingPage);
	await expectEnclosedReDerives(screen.container as HTMLElement);
});

test('SSR resume: an adopting part inside a rooted instance re-derives in that instance', async () => {
	const screen = await renderSSR(EnclosingPage);
	await expectEnclosedReDerives(screen.container);
});

test('CSR: the enclosing instance rosters the parts that adopted it', async () => {
	const screen = await render(EnclosingPage);
	expect(await rosters(screen.container as HTMLElement)).toEqual(['a,b,c']);
});

test('SSR resume: the enclosing instance rosters the parts that adopted it', async () => {
	const screen = await renderSSR(EnclosingPage);
	expect(await rosters(screen.container)).toEqual(['a,b,c']);
});

test('CSR: two rooted instances of the family keep separate rosters and derives', async () => {
	const screen = await render(TwoPanelsPage);
	await expectPanelsStaySeparate(screen.container as HTMLElement);
});

test('SSR resume: two rooted instances of the family keep separate rosters and derives', async () => {
	const screen = await renderSSR(TwoPanelsPage);
	await expectPanelsStaySeparate(screen.container);
});
