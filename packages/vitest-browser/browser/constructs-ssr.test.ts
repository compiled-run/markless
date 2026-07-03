import { afterEach, expect, test } from 'vitest';
import { cleanup, renderSSR } from '../src/index.ts';
import AsyncDetails from './fixtures/async-details.tsrx';
import AttachBehavior from './fixtures/attach-behavior.tsrx';
import DynamicTag from './fixtures/dynamic-tag.tsrx';
import ElementHandle from './fixtures/element-handle.tsrx';
import FragmentRoot from './fixtures/fragment-root.tsrx';
import InputEcho from './fixtures/input-echo.tsrx';
import OnlyIf from './fixtures/only-if.tsrx';
import RowsChoose from './fixtures/rows-choose.tsrx';
import RowsEmpty from './fixtures/rows-empty.tsrx';
import RowsIndex from './fixtures/rows-index.tsrx';
import ScopedStyle from './fixtures/scoped-style.tsrx';
import SpreadClass from './fixtures/spread-class.tsrx';
import SwitchArms from './fixtures/switch-arms.tsrx';

afterEach(() => cleanup());

function requireElement<T extends Element>(container: HTMLElement, selector: string): T {
	const element = container.querySelector<T>(selector);
	if (!element) throw new Error(`Expected "${selector}" in the server-rendered DOM.`);
	return element;
}

test('SSR: input and click events both resume and drive the state text binding', async () => {
	const screen = await renderSSR(InputEcho);
	const container = screen.container;

	expect(container.querySelector('[data-async-container]')).not.toBeNull();
	const input = requireElement<HTMLInputElement>(container, 'input[data-name]');
	const echo = requireElement<HTMLOutputElement>(container, 'output[data-echo]');
	expect(echo.textContent).toBe('start');

	input.value = 'typed';
	input.dispatchEvent(new Event('input', { bubbles: true }));
	await expect.poll(() => echo.textContent).toBe('typed');

	requireElement<HTMLButtonElement>(container, 'button[data-reset]').click();
	await expect.poll(() => echo.textContent).toBe('reset');
});

test('SSR: spread attributes render and the conditional class flips after resume', async () => {
	const screen = await renderSSR(SpreadClass);
	const container = screen.container;
	const section = requireElement<HTMLElement>(container, 'section[data-kind="card"]');

	expect(section.getAttribute('id')).toBe('hero');
	expect(section.getAttribute('role')).toBe('note');
	expect(section.hasAttribute('hidden')).toBe(false);
	expect(section.getAttribute('title')).toBe('Final');

	const button = requireElement<HTMLButtonElement>(container, 'button[data-pick]');
	expect(button.className).toBe('chip plain');
	button.click();
	await expect.poll(() => button.className).toBe('chip picked');
});

test('SSR: @if without @else flips the empty alternate range round-trip', async () => {
	const screen = await renderSSR(OnlyIf);
	const container = screen.container;
	const toggle = requireElement<HTMLButtonElement>(container, 'button[data-toggle]');

	expect(container.querySelector('p.only')?.textContent).toBe('Shown');

	toggle.click();
	await expect.poll(() => container.querySelector('p.only')).toBeNull();

	toggle.click();
	await expect.poll(() => container.querySelector('p.only')?.textContent).toBe('Shown');
});

test('SSR: @switch with @default flips across all three arms after resume', async () => {
	const screen = await renderSSR(SwitchArms);
	const container = screen.container;

	expect(container.querySelector('p.arm-a')?.textContent).toBe('Alpha arm');

	requireElement<HTMLButtonElement>(container, 'button[data-to-beta]').click();
	await expect.poll(() => container.querySelector('p.arm-b')?.textContent).toBe('Beta arm');
	expect(container.querySelector('p.arm-a')).toBeNull();

	requireElement<HTMLButtonElement>(container, 'button[data-to-other]').click();
	await expect.poll(() => container.querySelector('p.arm-d')?.textContent).toBe('Default arm');
	expect(container.querySelector('p.arm-b')).toBeNull();

	requireElement<HTMLButtonElement>(container, 'button[data-to-alpha]').click();
	await expect.poll(() => container.querySelector('p.arm-a')?.textContent).toBe('Alpha arm');
	expect(container.querySelector('p.arm-d')).toBeNull();
});

test('SSR: keyed @for rows resume per-row locals from the clicked row', async () => {
	const screen = await renderSSR(RowsChoose);
	const container = screen.container;
	const rows = Array.from(container.querySelectorAll('article'));
	const chosen = requireElement<HTMLOutputElement>(container, 'output[data-chosen]');

	expect(rows.map((row) => row.querySelector('h2')?.textContent)).toEqual([
		'Alpha',
		'Beta',
		'Gamma',
	]);
	expect(chosen.textContent).toBe('none');

	const secondRowButton = rows[1]?.querySelector<HTMLButtonElement>('button');
	if (!secondRowButton) throw new Error('Expected a button in the second server-rendered row.');
	secondRowButton.click();
	await expect.poll(() => chosen.textContent).toBe('beta');
});

test('SSR: keyed @for renders the @empty branch for an initially empty collection', async () => {
	const screen = await renderSSR(RowsEmpty);
	const container = screen.container;

	expect(container.querySelector('li.empty')?.textContent).toBe('No items yet');
	expect(container.querySelector('li.row')).toBeNull();
});

test('SSR: keyed @for with an index clause renders index text per row', async () => {
	// Index-reading repeats are gated ssrOnly by the compiler (no rowEvents are
	// shipped because reorder cannot rewrite index text yet); the server render
	// must still show correct per-row index text.
	const screen = await renderSSR(RowsIndex);
	const container = screen.container;
	const rows = Array.from(container.querySelectorAll('li'));

	expect(rows.map((row) => row.textContent)).toEqual(['0Alpha', '1Beta']);
});

test.fails('SSR: async computed serves @pending, then resume settles the @try content', async () => {
	// KNOWN RED (bug): the server correctly renders the @pending branch with
	// boundary comment anchors and ships the runner symbol
	// (runnerSymbolId in view.asyncBoundaries), but the resumed page never
	// kicks the async computed run — the boundary shows "Loading" forever with
	// no interaction available to trigger it.
	const screen = await renderSSR(AsyncDetails);
	const container = screen.container;

	expect(container.querySelector('p.pending')?.textContent).toBe('Loading');
	expect(container.querySelector('p.done')).toBeNull();

	await expect.poll(() => container.querySelector('p.done')?.textContent).toBe('Hello Ada');
	expect(container.querySelector('p.pending')).toBeNull();
});

test('SSR: dynamic tag <{expr}> renders the computed element', async () => {
	const screen = await renderSSR(DynamicTag);
	const container = screen.container;
	const card = requireElement<HTMLElement>(container, 'section > .card');

	expect(card.tagName).toBe('ARTICLE');
	expect(card.textContent).toBe('Hi');
});

test('SSR: fragment-rooted component serves sibling roots and resumes events', async () => {
	const screen = await renderSSR(FragmentRoot);
	const container = screen.container;

	expect(container.querySelector('header')?.textContent).toBe('Site');
	const button = requireElement<HTMLButtonElement>(container, 'button[data-count]');
	expect(button.textContent).toBe('0');

	button.click();
	await expect.poll(() => button.textContent).toBe('1');
});

test('SSR: scoped <style> serves the mk-* scope class merged with author classes', async () => {
	const screen = await renderSSR(ScopedStyle);
	const container = screen.container;
	const section = requireElement<HTMLElement>(container, 'section.card');
	const heading = requireElement<HTMLHeadingElement>(container, 'h2.title');

	const scopeClass = Array.from(section.classList).find((name) => name.startsWith('mk-'));
	expect(scopeClass).toMatch(/^mk-[a-z0-9]+$/);
	expect(heading.classList.contains(scopeClass ?? '')).toBe(true);
	expect(container.querySelector('style')).toBeNull();
});

test('SSR: attach={...} behavior activates from the first host interaction', async () => {
	// Resumed behaviors are trigger-activated (resume.ts
	// activateBehaviorsFromTrigger): the first dispatched event on the behavior
	// host must activate the attach function. The compiler emits no
	// visible-event record for behavior hosts, so no interaction means no
	// activation — this test asserts the shipped interaction trigger path.
	const screen = await renderSSR(AttachBehavior);
	const container = screen.container;
	const host = requireElement<HTMLParagraphElement>(container, 'p[data-host]');
	const taps = requireElement<HTMLOutputElement>(container, 'output[data-taps]');

	host.click();
	await expect.poll(() => taps.textContent).toBe('1');
	await expect.poll(() => host.getAttribute('data-behavior')).toBe('on');
});

test('SSR: el={...} element handle methods run inside a resumed event handler', async () => {
	// KNOWN RED (bug): same silent drop as CSR — the compiled event symbol
	// omits the `box.focus()` element-handle call, keeping only the graph
	// write, so the resumed click never focuses the input.
	const screen = await renderSSR(ElementHandle);
	const container = screen.container;
	const input = requireElement<HTMLInputElement>(container, 'input[data-box]');
	const status = requireElement<HTMLOutputElement>(container, 'output[data-status]');

	requireElement<HTMLButtonElement>(container, 'button[data-focus]').click();
	await expect.poll(() => status.textContent).toBe('focused');
	expect(document.activeElement).toBe(input);
});
