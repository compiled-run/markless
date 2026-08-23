import { afterEach, expect, test } from 'vitest';
import { cleanup, render } from '../src/index.ts';
import ModalPage from './fixtures/csr-idref-modal-page.tsrx';

// Defect 65, CSR half. A part that BINDS a shared element() handle, rendered
// inside the projection of the part that READS it as an IDREF, minted an id the
// reference did not spell: the CSR seed pass registered a widget-instance token
// for EVERY projecting child, so `Content` overwrote the token `Root` had
// written and `Title`, nested in Content's projection, minted from Content's.
//
// The compiler half of this is pinned by `nested-part-idref-minting.test.ts`;
// this is the browser proof that the client render path spells one string.
afterEach(() => cleanup());

function modalPair(container: ParentNode, name: string) {
	const scope = container.querySelector(`[data-modal="${name}"]`);
	const dialog = scope?.querySelector<HTMLElement>('[data-modal-content]');
	const title = scope?.querySelector<HTMLHeadingElement>('[data-modal-title]');
	if (!dialog || !title) throw new Error(`Expected modal ${name} to render the dialog and title.`);
	return {
		dialog,
		title,
		labelledby: dialog.getAttribute('aria-labelledby'),
		id: title.getAttribute('id'),
	};
}

test('CSR: the dialog names the title nested inside its own projection', async () => {
	const screen = await render(ModalPage);
	const first = modalPair(screen.container as HTMLElement, 'a');

	expect(first.id).toBeTruthy();
	// One string, both sides. Before the fix these differed by the projecting
	// part's own edge segment.
	expect(first.labelledby).toBe(first.id);
	// The IDREF really resolves, which is the whole point: an accessible name is
	// only a name if the referenced element is findable in the document.
	expect(first.dialog.ownerDocument.getElementById(first.id!)).toBe(first.title);
	expect(first.dialog.getAttribute('role')).toBe('dialog');
	expect(first.title.textContent).toBe('Terms A');
});

test('CSR: two widgets on one page name their own titles, not each other', async () => {
	const screen = await render(ModalPage);
	const first = modalPair(screen.container as HTMLElement, 'a');
	const second = modalPair(screen.container as HTMLElement, 'b');

	expect(second.labelledby).toBe(second.id);
	// Widget scope: one rendered widget, one id. Gating the token must not
	// collapse the two instances onto the enclosing page's single token.
	expect(first.id).not.toBe(second.id);
	expect(first.dialog.ownerDocument.getElementById(second.id!)).toBe(second.title);
	expect(second.title.textContent).toBe('Terms B');
});
