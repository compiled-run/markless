import { afterEach, expect, test } from 'vitest';
import { cleanup, render } from '../src/index.ts';
import ArmEvents from './fixtures/arm-events.tsrx';
import AsyncDetails from './fixtures/async-details.tsrx';
import AttachBehavior from './fixtures/attach-behavior.tsrx';
import DynamicTag from './fixtures/dynamic-tag.tsrx';
import ElementHandle from './fixtures/element-handle.tsrx';
import FragmentRoot from './fixtures/fragment-root.tsrx';
import FragmentBranch from './fixtures/fragment-branch.tsrx';
import ProjectedCard from './fixtures/projected-card.tsrx';
import Dashboard from './fixtures/dashboard.tsrx';
import InputEcho from './fixtures/input-echo.tsrx';
import OnlyIf from './fixtures/only-if.tsrx';
import RowsChoose from './fixtures/rows-choose.tsrx';
import RowsEmpty from './fixtures/rows-empty.tsrx';
import RowsIndex from './fixtures/rows-index.tsrx';
import ScopedStyle from './fixtures/scoped-style.tsrx';
import SpreadClass from './fixtures/spread-class.tsrx';
import SwitchArms from './fixtures/switch-arms.tsrx';

afterEach(() => cleanup());

function queryContainer(container: unknown): HTMLElement {
	return container as HTMLElement;
}

function requireElement<T extends Element>(container: HTMLElement, selector: string): T {
	const element = container.querySelector<T>(selector);
	if (!element) throw new Error(`Expected "${selector}" in the rendered DOM.`);
	return element;
}

function elementOrder(container: HTMLElement): string[] {
	return Array.from(container.querySelectorAll('*')).map((element) =>
		element.tagName.toLowerCase(),
	);
}

test('CSR: input and click events both drive the same state text binding', async () => {
	const screen = await render(InputEcho);
	const container = queryContainer(screen.container);
	const input = requireElement<HTMLInputElement>(container, 'input[data-name]');
	const echo = requireElement<HTMLOutputElement>(container, 'output[data-echo]');

	expect(echo.textContent).toBe('start');
	expect(input.value).toBe('start');

	input.value = 'typed';
	input.dispatchEvent(new Event('input', { bubbles: true }));
	await expect.poll(() => echo.textContent).toBe('typed');

	requireElement<HTMLButtonElement>(container, 'button[data-reset]').click();
	await expect.poll(() => echo.textContent).toBe('reset');
});

test('CSR: spread attributes render and a conditional class binding flips on click', async () => {
	const screen = await render(SpreadClass);
	const container = queryContainer(screen.container);
	const section = requireElement<HTMLElement>(container, 'section[data-kind="card"]');

	expect(section.getAttribute('id')).toBe('hero');
	expect(section.getAttribute('role')).toBe('note');
	expect(section.hasAttribute('hidden')).toBe(false);
	// Literal attributes after the spread win over spread entries.
	expect(section.getAttribute('title')).toBe('Final');

	const button = requireElement<HTMLButtonElement>(container, 'button[data-pick]');
	expect(button.className).toBe('chip plain');
	button.click();
	await expect.poll(() => button.className).toBe('chip picked');
});

test('CSR: @if without @else flips the empty alternate range round-trip', async () => {
	const screen = await render(OnlyIf);
	const container = queryContainer(screen.container);
	const toggle = requireElement<HTMLButtonElement>(container, 'button[data-toggle]');

	expect(container.querySelector('p.only')?.textContent).toBe('Shown');

	toggle.click();
	await expect.poll(() => container.querySelector('p.only')).toBeNull();

	toggle.click();
	await expect.poll(() => container.querySelector('p.only')?.textContent).toBe('Shown');
});

test('CSR: buttons inside @if arms dispatch from the taken and flipped-in arm', async () => {
	// Arm-host records ride the branch armRecords (L4 S3b): the rendered arm's
	// button must dispatch, and after a flip the new arm's button must too.
	const screen = await render(ArmEvents);
	const container = queryContainer(screen.container);
	const note = requireElement<HTMLOutputElement>(container, 'output[data-note]');

	expect(note.textContent).toBe('none');
	requireElement<HTMLButtonElement>(container, 'button[data-open]').click();
	await expect.poll(() => note.textContent).toBe('from-open');

	requireElement<HTMLButtonElement>(container, 'button[data-toggle]').click();
	await expect.poll(() => container.querySelector('button[data-closed]')).not.toBeNull();
	requireElement<HTMLButtonElement>(container, 'button[data-closed]').click();
	await expect.poll(() => note.textContent).toBe('from-closed');
});

test('CSR: @switch with @default flips across all three arms by clicking', async () => {
	const screen = await render(SwitchArms);
	const container = queryContainer(screen.container);

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

test('CSR: keyed @for rows dispatch per-row locals from the clicked row', async () => {
	const screen = await render(RowsChoose);
	const container = queryContainer(screen.container);
	const rows = Array.from(container.querySelectorAll('article'));
	const chosen = requireElement<HTMLOutputElement>(container, 'output[data-chosen]');

	expect(rows.map((row) => row.querySelector('h2')?.textContent)).toEqual([
		'Alpha',
		'Beta',
		'Gamma',
	]);
	expect(chosen.textContent).toBe('none');

	const secondRowButton = rows[1]?.querySelector<HTMLButtonElement>('button');
	if (!secondRowButton) throw new Error('Expected a button in the second rendered row.');
	secondRowButton.click();
	await expect.poll(() => chosen.textContent).toBe('beta');
});

test('CSR: keyed @for renders the @empty branch for an initially empty collection', async () => {
	const screen = await render(RowsEmpty);
	const container = queryContainer(screen.container);

	expect(container.querySelector('li.empty')?.textContent).toBe('No items yet');
	expect(container.querySelector('li.row')).toBeNull();
});

test('CSR: keyed @for with an index clause renders index text per row', async () => {
	// The compiler gates index-reading repeats as ssrOnly (no rowEvents are
	// shipped because reorder cannot rewrite index text yet); initial render
	// must still show correct index text in both modes.
	const screen = await render(RowsIndex);
	const container = queryContainer(screen.container);
	const rows = Array.from(container.querySelectorAll('li'));

	expect(rows.map((row) => row.textContent)).toEqual(['0Alpha', '1Beta']);
});

test('CSR: async computed shows @pending first, then the resolved @try content', async () => {
	// CSR mount is a local demand: @pending renders between the boundary
	// anchors, the runner starts at runtime creation, and settle replaces the
	// range with the resolved @try arm.
	const screen = await render(AsyncDetails);
	const container = queryContainer(screen.container);

	expect(container.querySelector('p.pending')?.textContent).toBe('Loading');
	expect(container.querySelector('p.done')).toBeNull();

	await expect.poll(() => container.querySelector('p.done')?.textContent).toBe('Hello Ada');
	expect(container.querySelector('p.pending')).toBeNull();
});

test('CSR: dynamic tag <{expr}> renders the computed element', async () => {
	const screen = await render(DynamicTag);
	const container = queryContainer(screen.container);
	const card = requireElement<HTMLElement>(container, 'section > .card');

	expect(card.tagName).toBe('ARTICLE');
	expect(card.textContent).toBe('Hi');
});

test('CSR: fragment-rooted component mounts sibling roots and dispatches events', async () => {
	const screen = await render(FragmentRoot);
	const container = queryContainer(screen.container);

	expect(container.querySelector('header')?.textContent).toBe('Site');
	const button = requireElement<HTMLButtonElement>(container, 'button[data-count]');
	expect(button.textContent).toBe('0');

	button.click();
	await expect.poll(() => button.textContent).toBe('1');
});

test('CSR: scoped <style> adds the mk-* scope class merged with author classes', async () => {
	const screen = await render(ScopedStyle);
	const container = queryContainer(screen.container);
	const section = requireElement<HTMLElement>(container, 'section');
	const heading = requireElement<HTMLHeadingElement>(container, 'h2');

	const scopeClass = Array.from(section.classList).find((name) => name.startsWith('mk-'));
	expect(scopeClass).toMatch(/^mk-[a-z0-9]+$/);
	expect(section.classList.contains('card')).toBe(true);
	expect(heading.classList.contains('title')).toBe(true);
	expect(heading.classList.contains(scopeClass ?? '')).toBe(true);
	// The <style> block itself must not appear in rendered output.
	expect(container.querySelector('style')).toBeNull();
});

test('CSR: attach={...} behavior runs against the real host element', async () => {
	const screen = await render(AttachBehavior);
	const container = queryContainer(screen.container);
	const host = requireElement<HTMLParagraphElement>(container, 'p[data-host]');

	await expect.poll(() => host.getAttribute('data-behavior')).toBe('on');

	const taps = requireElement<HTMLOutputElement>(container, 'output[data-taps]');
	host.click();
	await expect.poll(() => taps.textContent).toBe('1');
});

test('CSR: el={...} element handle methods run inside an event handler', async () => {
	const screen = await render(ElementHandle);
	const container = queryContainer(screen.container);
	const input = requireElement<HTMLInputElement>(container, 'input[data-box]');
	const status = requireElement<HTMLOutputElement>(container, 'output[data-status]');

	requireElement<HTMLButtonElement>(container, 'button[data-focus]').click();
	await expect.poll(() => status.textContent).toBe('focused');
	expect(document.activeElement).toBe(input);
});

test('CSR: fragment root with an @if child flips the branch range', async () => {
	const screen = await render(FragmentBranch);
	const container = queryContainer(screen.container);

	expect(container.querySelector('p.on')?.textContent).toBe('Shown');
	const button = container.querySelector('button');
	(button as HTMLButtonElement).click();
	await expect.poll(() => container.querySelector('p.off')?.textContent).toBe('Hidden');
	expect(container.querySelector('p.on')).toBeNull();
});

// Un-marked from test.fails after T006: the decode-lean dispatch path made CSR static
// children projection render correctly (SSR twin still deferred to the projection goal).
test('CSR: static children projection renders inside the wrapping component', async () => {
	// KNOWN RED (deferred design, T012 Q2): children placement projects raw
	// HTML correctly since the S5 escape fix, but hosts inside projected
	// element children keep caller-coordinate locators while rendering inside
	// the child component — resume throws Mismatched resume locator. The
	// projection-metadata design (spec 01:163-166 names it, defines no shape)
	// is deferred; this test flips green when it lands.
	const screen = await render(ProjectedCard);
	const container = queryContainer(screen.container);

	// card.tsrx puts <h2> before {children}, so the projected <p> follows it.
	expect(elementOrder(container)).toEqual(['main', 'section', 'h2', 'p', 'button', 'output']);

	// Spec 01: children place as an opaque template projection.
	const projected = container.querySelector('section.card p.projected');
	expect(projected?.textContent).toBe('Projected content');

	const button = container.querySelector('button');
	(button as HTMLButtonElement).click();
	await expect.poll(() => container.querySelector('output')?.textContent).toBe('clicked');
});

test('CSR: a child component @if driven by a parent prop flips on click', async () => {
	// The demo-app regression shape: the branch lives in a child component and
	// its condition is a parent-graph prop — composition must carry the branch
	// record across the component edge (prefixed id, remapped test read,
	// anchors resolved against the composed comment stream).
	const screen = await render(Dashboard);
	const container = queryContainer(screen.container);

	expect(container.querySelector('em.live')?.textContent).toBe('Live');
	const button = container.querySelector('button');
	(button as HTMLButtonElement).click();
	await expect.poll(() => container.querySelector('em.idle')?.textContent).toBe('Idle');
	expect(container.querySelector('em.live')).toBeNull();

	(button as HTMLButtonElement).click();
	await expect.poll(() => container.querySelector('em.live')?.textContent).toBe('Live');
});
