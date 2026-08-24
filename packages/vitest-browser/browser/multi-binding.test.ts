import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../src/index.ts';
import EventsPage from './fixtures/mb-events-page.tsrx';
import NavPage from './fixtures/mb-nav-page.tsrx';
import RadioPage from './fixtures/mb-radio-page.tsrx';

// Owner ruling 2026-08-23, "A plus the three, plus events": one element binds
// SEVERAL handles (`el={[a, b]}`), a handle read names its widget from where the
// HANDLE was declared, a set may be declared wider than the tag it binds on, a
// consumer's `el=` rides `{...rest}` alongside the part's own, and an event
// attribute takes a list of handlers that a spread-carried one merges into.
afterEach(() => cleanup());

function one(container: ParentNode, selector: string) {
	const node = container.querySelector<HTMLElement>(selector);
	if (!node) throw new Error(`Expected ${selector}.`);
	return node;
}

function all(container: ParentNode, selector: string) {
	return [...container.querySelectorAll<HTMLElement>(selector)];
}

// The trail is served EMPTY, so polling it for '' cannot tell a finished reset
// from one whose lazy handler is still loading - and a reset landing mid-list
// would rewrite the very order these rows are about. `data-resets` counts the
// resets that actually ran, which is a settle point with only one meaning.
async function resetTrail(container: ParentNode) {
	const root = one(container, '[data-mb-events-root]');
	one(container, '[data-mb-reset]').click();
	await expect.poll(() => root.getAttribute('data-resets')).toBe('1');
	expect(root.getAttribute('data-trail')).toBe('');
}

// ---------------------------------------------------------------- radio-group

// The shape the ruling names: one `<input>` carries the ITEM instance's singular
// IDREF-capable handle and a member of the GROUP instance's set. The walk must
// see all three inputs, and the label's `for=` must resolve to its own input.
async function expectRadioGroupToBind(container: ParentNode) {
	const group = one(container, '[data-mb-group]');
	one(container, '[data-mb-walk]').click();
	await expect.poll(() => group.getAttribute('data-order')).toBe('alpha|beta|gamma');
}

test('CSR: a singular handle and a set member bind on one input, and the walk reads the set', async () => {
	const screen = await render(RadioPage);
	await expectRadioGroupToBind(screen.container as HTMLElement);
});

test('SSR resume: the same input carries both bindings after resume', async () => {
	const screen = await renderSSR(RadioPage);
	await expectRadioGroupToBind(screen.container);
});

// The IDREF half: the label's `for=` names the item handle, and the id it points
// at is minted on the input that also carries the group's set membership.
function expectLabelsToNameTheirOwnInput(container: ParentNode) {
	const labels = all(container, '[data-mb-label]');
	const fields = all(container, '[data-mb-field]');
	expect(labels).toHaveLength(3);

	for (const [index, label] of labels.entries()) {
		const target = label.getAttribute('for');
		expect(target, 'the label must carry a minted id, not an empty for=').toBeTruthy();
		expect(
			container.querySelector(`#${CSS.escape(target!)}`),
			'the for= must resolve to this item own input',
		).toBe(fields[index]);
	}
	// Three ids, all different: one per rendered item instance.
	expect(new Set(labels.map((label) => label.getAttribute('for'))).size).toBe(3);
}

test('CSR: each label for= resolves to its own item input', async () => {
	const screen = await render(RadioPage);
	expectLabelsToNameTheirOwnInput(screen.container as HTMLElement);
});

test('SSR: each served label for= resolves to its own item input', async () => {
	const screen = await renderSSR(RadioPage);
	expectLabelsToNameTheirOwnInput(screen.container);
});

// Instance-from-declaration. One handler reads BOTH handles from an element that
// carries registrations from two widget instances: the item handle must answer
// this item's own input, and the group handle the whole group's set.
async function expectEachReadToAnswerItsDeclaringInstance(container: ParentNode) {
	const items = all(container, '[data-mb-item]');
	const group = one(container, '[data-mb-group]');
	const probes = all(container, '[data-mb-probe]');
	expect(probes).toHaveLength(3);

	probes[1]!.click();
	await expect.poll(() => group.getAttribute('data-picked')).toBe('beta');

	probes[2]!.click();
	await expect.poll(() => group.getAttribute('data-picked')).toBe('gamma');

	// And the label read, which climbs no DOM at all, answers its own item.
	one(items[0]!, '[data-mb-label]').click();
	await expect.poll(() => items[0]!.getAttribute('data-hit')).toBe('alpha');
	expect(items[1]!.getAttribute('data-hit')).toBe('');
}

test('CSR: two instances on one element, each read answering its declaring instance', async () => {
	const screen = await render(RadioPage);
	await expectEachReadToAnswerItsDeclaringInstance(screen.container as HTMLElement);
});

test('SSR resume: each read still answers its declaring instance after resume', async () => {
	const screen = await renderSSR(RadioPage);
	await expectEachReadToAnswerItsDeclaringInstance(screen.container);
});

// -------------------------------------------------------- heterogeneous typing

// `element<HTMLElement[]>()` is ONE ordered set across three different tags.
async function expectHeterogeneousSet(container: ParentNode) {
	const nav = one(container, '[data-mb-nav]');
	one(container, '[data-mb-nav-probe]').click();
	await expect.poll(() => nav.getAttribute('data-tags')).toBe('nav|button|a');
}

test('CSR: one set spans nav, button and a, in document order', async () => {
	const screen = await render(NavPage);
	await expectHeterogeneousSet(screen.container as HTMLElement);
});

test('SSR resume: the heterogeneous set reads back across all three tags', async () => {
	const screen = await renderSSR(NavPage);
	await expectHeterogeneousSet(screen.container);
});

// -------------------------------------------------------------------- events

async function expectAuthoredOrder(container: ParentNode) {
	const root = one(container, '[data-mb-events-root]');
	await resetTrail(container);

	one(container, '[data-mb-order]').click();
	await expect.poll(() => root.getAttribute('data-trail')).toBe('one|two|three');
}

test('CSR: an event array runs its handlers in authored order', async () => {
	const screen = await render(EventsPage);
	await expectAuthoredOrder(screen.container as HTMLElement);
});

test('SSR resume: an event array runs its handlers in authored order after resume', async () => {
	const screen = await renderSSR(EventsPage);
	await expectAuthoredOrder(screen.container);
});

async function expectStopImmediateToEndTheList(container: ParentNode) {
	const root = one(container, '[data-mb-events-root]');
	await resetTrail(container);

	one(container, '[data-mb-stop]').click();
	await expect.poll(() => root.getAttribute('data-trail')).toBe('first|second');
	// The third handler in the same list never ran: this is the DOM's own rule
	// for several listeners on ONE element, not a framework invention.
	await new Promise((resolve) => setTimeout(resolve, 60));
	expect(root.getAttribute('data-trail')).toBe('first|second');
}

test('CSR: stopImmediatePropagation ends the rest of the same element handler list', async () => {
	const screen = await render(EventsPage);
	await expectStopImmediateToEndTheList(screen.container as HTMLElement);
});

// Pinned: defect 88 - post-stop state write missing from graph at flush; un-pin when it lands.
test.fails('SSR resume: stopImmediatePropagation ends the list after resume too', async () => {
	const screen = await renderSSR(EventsPage);
	await expectStopImmediateToEndTheList(screen.container);
});

// The documented React divergence: a spread-carried handler MERGES with the
// part's own rather than standing in its place. Both run, the part's first.
async function expectSpreadHandlerToMerge(container: ParentNode) {
	const page = one(container, '[data-mb-events-page]');
	const root = one(container, '[data-mb-events-root]');
	await resetTrail(container);

	one(container, '[data-mb-merge]').click();
	// The part's own handler ran (its widget state carries `part`), and the
	// consumer's ran after it (the page state carries both, in that order).
	await expect.poll(() => page.getAttribute('data-trail')).toBe('part|consumer');
	expect(root.getAttribute('data-trail')).toBe('part');
}

test('CSR: a spread-carried handler merges with the part own handler', async () => {
	const screen = await render(EventsPage);
	await expectSpreadHandlerToMerge(screen.container as HTMLElement);
});

test('SSR resume: a spread-carried handler merges with the part own after resume', async () => {
	const screen = await renderSSR(EventsPage);
	await expectSpreadHandlerToMerge(screen.container);
});

async function expectMergedListToHonorStopImmediate(container: ParentNode) {
	const page = one(container, '[data-mb-events-page]');
	const root = one(container, '[data-mb-events-root]');
	await resetTrail(container);

	one(container, '[data-mb-merge-stop]').click();
	await expect.poll(() => root.getAttribute('data-trail')).toBe('part-stop');
	// Merged handlers are ONE listener list on one element, so the part stopping
	// immediately keeps the consumer's forwarded handler from running at all.
	await new Promise((resolve) => setTimeout(resolve, 60));
	expect(page.getAttribute('data-trail')).toBe('');
}

test('CSR: stopImmediatePropagation in the part handler stops the merged consumer handler', async () => {
	const screen = await render(EventsPage);
	await expectMergedListToHonorStopImmediate(screen.container as HTMLElement);
});

test('SSR resume: the merged list honours stopImmediatePropagation after resume', async () => {
	const screen = await renderSSR(EventsPage);
	await expectMergedListToHonorStopImmediate(screen.container);
});

// Spread-el acceptance: the consumer's handle rides `{...rest}` onto a part
// element that binds nothing of its own here, and reads back as that element.
async function expectSpreadHandleToResolve(container: ParentNode) {
	const page = one(container, '[data-mb-events-page]');
	one(container, '[data-mb-name]').click();
	await expect
		.poll(() => page.getAttribute('data-named'))
		.toContain('data-mb-merge');
}

// Pinned: spread-el read-back, not yet root-caused; un-pin when it lands.
test.fails('CSR: a consumer el riding the spread reads back as the part element', async () => {
	const screen = await render(EventsPage);
	await expectSpreadHandleToResolve(screen.container as HTMLElement);
});

// Pinned: spread-el read-back; un-pin when it lands.
test.fails('SSR resume: the spread-carried el reads back as the part element after resume', async () => {
	const screen = await renderSSR(EventsPage);
	await expectSpreadHandleToResolve(screen.container);
});
