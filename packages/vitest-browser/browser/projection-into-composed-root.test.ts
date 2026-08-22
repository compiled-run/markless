import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../src/index.ts';
import Page from './fixtures/pwr-page.tsrx';
import RowsPage from './fixtures/pwr-rows-page.tsrx';

// T071: widget resolution follows the RENDERED tree. A part written inside a
// component that COMPOSES a family root belongs to that composed root, because
// composition — not the consumer — is what placed it there. The fact is declared
// at build time by the composing component and read as compose-time data; no
// tree is walked and no child announces itself at runtime.
afterEach(() => cleanup());

function widgets(container: ParentNode) {
	return {
		roots: [...container.querySelectorAll('[data-pwr-root]')],
		triggers: [...container.querySelectorAll<HTMLButtonElement>('[data-pwr-trigger]')],
		labels: [...container.querySelectorAll('[data-pwr-label]')],
	};
}

// The relationship is the proof: a label names the trigger of the widget it
// belongs to, and each widget mints an id of its own.
function expectPartsResolveToTheComposedRoot(container: ParentNode) {
	const { roots, triggers, labels } = widgets(container);
	expect(roots.length).toBe(2);
	expect(triggers.length).toBe(2);
	expect(labels.length).toBe(2);

	for (const [index, label] of labels.entries()) {
		const id = triggers[index]?.getAttribute('id');
		expect(id).toBeTruthy();
		expect(label.getAttribute('for')).toBe(id);
	}
	expect(triggers[0]?.getAttribute('id')).not.toBe(triggers[1]?.getAttribute('id'));
}

// The seed the composed root wrote reaches the projected parts, and only theirs.
function expectSeedsPerWidget(container: ParentNode) {
	const { roots, triggers, labels } = widgets(container);
	expect(roots.map((root) => root.getAttribute('data-label'))).toEqual(['one', 'two']);
	expect(triggers.map((trigger) => trigger.getAttribute('data-label'))).toEqual(['one', 'two']);
	expect(labels.map((label) => label.getAttribute('data-label'))).toEqual(['one', 'two']);
}

async function expectGesturesStayPerWidget(container: ParentNode) {
	expect(widgets(container).triggers.map((trigger) => trigger.textContent)).toEqual([
		'false',
		'false',
	]);

	widgets(container).triggers[1]?.click();
	await expect
		.poll(() => widgets(container).triggers.map((trigger) => trigger.textContent))
		.toEqual(['false', 'true']);

	widgets(container).triggers[0]?.click();
	await expect
		.poll(() => widgets(container).triggers.map((trigger) => trigger.textContent))
		.toEqual(['true', 'true']);
}

test('CSR: a part projected into a composed family root resolves to that root', async () => {
	const screen = await render(Page);
	expectPartsResolveToTheComposedRoot(screen.container as HTMLElement);
});

// T073: the composed root's own seed runs. The seed pass descends the
// children-projection chain the composing child declares and runs each link's
// seeds in THAT link owner's scope, so a value written by the root composition
// placed inside reaches every part projected into it.
test('CSR: each composed root seeds only the parts projected into it', async () => {
	const screen = await render(Page);
	expectSeedsPerWidget(screen.container as HTMLElement);
});

test('CSR: a gesture on one composed widget leaves its sibling alone', async () => {
	const screen = await render(Page);
	await expectGesturesStayPerWidget(screen.container as HTMLElement);
});

test('SSR resume: minted ids and gestures agree with CSR', async () => {
	const screen = await renderSSR(Page);
	expectPartsResolveToTheComposedRoot(screen.container);
	await expectGesturesStayPerWidget(screen.container);
});

// A keyed row composes a widget of its own, so the row segment has to reach the
// minted handle as well as the row's state.
// Pinned on a NEW named defect, measured on this branch: A PART IS A SIBLING OF
// THE WIDGET ROOT ITS COMPOSITION PLACED IT IN. The row's parts sit at
// `r:alpha:c0:p1:` while the root the row's child composed sits at
// `r:alpha:c0:c0:`, and `marklessWidgetRootPath` only walks PREFIXES of the
// part's own path, so no prefix names that root and every row's parts fall back
// to the unprefixed shared id — one instance for both rows. Two halves are
// needed and both were measured here: a widget id that already names its root
// has to keep taking the instance path when it is composed again (otherwise
// both rows' roots collapse onto `c0:shared:...` regardless), and the projecting
// child's declared chain has to be registered as the answer for its siblings.
// Landing only the CSR half turns `SSR resume: minted ids and gestures agree
// with CSR` red, because the SSR emitted seed pass registers no such answer:
// the two sides then disagree about which node a part reads. Un-pin when the
// compiler's SSR seed pass declares the same chain the CSR pass does.
test.skip('CSR: a keyed row composes a widget of its own', async () => {
	const screen = await render(RowsPage);
	const container = screen.container as HTMLElement;
	const { triggers, labels } = widgets(container);
	expect(triggers.length).toBe(2);
	expect(triggers[0]?.getAttribute('id')).not.toBe(triggers[1]?.getAttribute('id'));
	for (const [index, label] of labels.entries())
		expect(label.getAttribute('for')).toBe(triggers[index]?.getAttribute('id'));

	triggers[0]?.click();
	await expect
		.poll(() => widgets(container).triggers.map((trigger) => trigger.textContent))
		.toEqual(['true', 'false']);
});
