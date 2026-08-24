import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../src/index.ts';
import ProjectionSplicePage from './fixtures/projection-splice-page.tsrx';

// The served locator table promises that entry `i` names the element a document
// walk reaches at position `i`. A projecting child broke that promise whenever it
// wrote markup AFTER `{children}`: the HTML spliced the projection inside the
// child, the token stream appended it. This lane is the DOM witness — resume
// wires the click and the text update onto the button only if the table agrees
// with the document.
afterEach(() => cleanup());

function requireElement<T extends Element>(container: HTMLElement, selector: string): T {
	const element = container.querySelector<T>(selector);
	if (!element) throw new Error(`Expected "${selector}" in the rendered DOM.`);
	return element;
}

/** The page's own subtree, in document order — the SSR container also holds the shell. */
function walkedTagNames(container: HTMLElement): ReadonlyArray<string> {
	const main = requireElement<HTMLElement>(container, 'main');
	return [main, ...main.querySelectorAll('*')].map((element) => element.tagName.toLowerCase());
}

test('SSR: the projection is served between the child\'s own elements', async () => {
	const screen = await renderSSR(ProjectionSplicePage);
	const container = screen.container as HTMLElement;

	// main(0) div(1) p(2) button(3) — the projected <p> sits INSIDE the child,
	// ahead of the button the child wrote after `{children}`.
	expect(walkedTagNames(container)).toEqual(['main', 'div', 'p', 'button']);
	expect(requireElement(container, '[data-box]').firstElementChild?.getAttribute('data-projected'))
		.toBe('');
});

test('SSR: resume wires the element AFTER the projection, not the projected one', async () => {
	const screen = await renderSSR(ProjectionSplicePage);
	const container = screen.container as HTMLElement;
	const button = requireElement<HTMLButtonElement>(container, 'button[data-after]');
	const projected = requireElement<HTMLElement>(container, 'p[data-projected]');

	expect(button.textContent).toBe('0');
	button.click();

	// The click record and the text update both belong to the button. When the
	// table was off by the projection's element count they landed on the <p>.
	await expect.poll(() => button.textContent).toBe('1');
	expect(projected.textContent).toBe('projected');
});

test('CSR: the same page renders the projection in the same place', async () => {
	const screen = await render(ProjectionSplicePage);
	const container = screen.container as HTMLElement;

	expect(walkedTagNames(container)).toEqual(['main', 'div', 'p', 'button']);
	const button = requireElement<HTMLButtonElement>(container, 'button[data-after]');
	button.click();
	await expect.poll(() => button.textContent).toBe('1');
});
