import { renderCsrIslands, renderSSRIslands } from '@markless/vitest-browser';
import { page, userEvent } from 'vite-plus/test/browser';
import { expect, test } from 'vitest';
import ModalBeforeRoot from './scenarios/modal-before-root.tsrx';

const Root = page.getByTestId('root');
const DocsTrigger = page.getByTestId('Docs-itemtrigger');
const DocsContent = page.getByTestId('Docs-itemcontent');
const HomeLink = page.getByTestId('home-itemlink');
const DesktopLink = page.getByTestId('desktop-itemlink');

function el<T extends Element = HTMLElement>(locator: { element(): Element | null }) {
	const found = locator.element();
	if (!found) throw new Error('Expected the part to be on the page.');
	return found as T;
}

// Islands give the page a non-empty root path, which is what lets a navbar part
// outside every navbar root claim readers inside the navbar's keyed rows.
const MODES = ['CSR', 'SSR'] as const;

for (const mode of MODES) {
	test(`${mode}: a navbar part from another module inside an earlier modal leaves the navbar's triggers working`, async () => {
		if (mode === 'SSR') await renderSSRIslands([ModalBeforeRoot]);
		else await renderCsrIslands([ModalBeforeRoot]);

		el(DocsTrigger).click();
		await expect.poll(() => el(DocsContent).hasAttribute('hidden')).toBe(false);
		expect(el(DocsTrigger).getAttribute('aria-expanded')).toBe('true');
		expect(el(Root).hasAttribute('ui-open')).toBe(true);
	});

	test(`${mode}: the navbar's arrow walk reaches its own part from another module`, async () => {
		if (mode === 'SSR') await renderSSRIslands([ModalBeforeRoot]);
		else await renderCsrIslands([ModalBeforeRoot]);

		el(HomeLink).focus();
		await userEvent.keyboard('{ArrowRight}');
		await expect.poll(() => document.activeElement).toBe(el(DocsTrigger));
		await userEvent.keyboard('{ArrowRight}');
		await userEvent.keyboard('{ArrowRight}');
		await expect.poll(() => document.activeElement).toBe(el(DesktopLink));
	});
}
