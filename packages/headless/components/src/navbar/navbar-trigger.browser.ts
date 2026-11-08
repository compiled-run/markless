import { render, renderSSR } from '@markless/vitest-browser';
import { page, userEvent } from 'vite-plus/test/browser';
import { expect, test } from 'vitest';
import BarControls from './scenarios/bar-controls.tsrx';

const Root = page.getByTestId('root');
const Brand = page.getByTestId('brand-itemlink');
const DocsTrigger = page.getByTestId('docs-itemtrigger');
const DocsContent = page.getByTestId('docs-itemcontent');
const StartLink = page.getByTestId('start-itemlink');
const InnerTrigger = page.getByTestId('inner-trigger');
const ApiLink = page.getByTestId('api-itemlink');
const ThemeTrigger = page.getByTestId('theme-trigger');
const CtaLink = page.getByTestId('cta-itemlink');
const Presses = page.getByTestId('presses');
const OutsideTrigger = page.getByTestId('outside-trigger');

function el<T extends Element = HTMLElement>(locator: { element(): Element | null }) {
	const found = locator.element();
	if (!found) throw new Error('Expected the part to be on the page.');
	return found as T;
}

// QDS's navbar walks every control in the bar. Here a control joins that walk by
// being a navbar part, so a switch in the bar is a stop in document order.

test('CSR: ArrowRight and ArrowLeft reach a bar control in document order', async () => {
	await render(BarControls);
	el(Brand).focus();

	await userEvent.keyboard('{ArrowRight}');
	await expect.poll(() => document.activeElement).toBe(el(DocsTrigger));
	await userEvent.keyboard('{ArrowRight}');
	await expect.poll(() => document.activeElement).toBe(el(ThemeTrigger));
	await userEvent.keyboard('{ArrowRight}');
	await expect.poll(() => document.activeElement).toBe(el(CtaLink));

	await userEvent.keyboard('{ArrowLeft}');
	await expect.poll(() => document.activeElement).toBe(el(ThemeTrigger));
	await userEvent.keyboard('{ArrowLeft}');
	await expect.poll(() => document.activeElement).toBe(el(DocsTrigger));
});

test('CSR: the walk steps over a bar control that is not rendered', async () => {
	await render(BarControls);
	el(ThemeTrigger).focus();

	await userEvent.keyboard('{ArrowRight}');
	await expect.poll(() => document.activeElement).toBe(el(CtaLink));
	await userEvent.keyboard('{ArrowLeft}');
	await expect.poll(() => document.activeElement).toBe(el(ThemeTrigger));
});

test('CSR: Home and End from a bar control land on the first and last stops', async () => {
	await render(BarControls);
	el(ThemeTrigger).focus();

	await userEvent.keyboard('{End}');
	await expect.poll(() => document.activeElement).toBe(el(CtaLink));
	await userEvent.keyboard('{Home}');
	await expect.poll(() => document.activeElement).toBe(el(Brand));
	await userEvent.keyboard('{ArrowLeft}');
	await expect.poll(() => document.activeElement).toBe(el(CtaLink));
});

test('CSR: a control inside a dropdown is a stop in that dropdown, and Home and End reach its ends', async () => {
	await render(BarControls);
	el(DocsTrigger).focus();

	await userEvent.keyboard('{ArrowDown}');
	await expect.poll(() => document.activeElement).toBe(el(StartLink));
	await userEvent.keyboard('{ArrowDown}');
	await expect.poll(() => document.activeElement).toBe(el(InnerTrigger));
	await userEvent.keyboard('{ArrowDown}');
	await expect.poll(() => document.activeElement).toBe(el(ApiLink));
	await userEvent.keyboard('{Home}');
	await expect.poll(() => document.activeElement).toBe(el(StartLink));
	await userEvent.keyboard('{End}');
	await expect.poll(() => document.activeElement).toBe(el(ApiLink));
	expect(el(DocsContent).hasAttribute('hidden')).toBe(false);
});

test('CSR: pressing a bar control runs its own click and opens no dropdown', async () => {
	await render(BarControls);

	el(ThemeTrigger).click();
	await expect.poll(() => el(Presses).textContent).toBe('1');
	expect(el(Root).hasAttribute('ui-open')).toBe(false);
	expect(el(ThemeTrigger).getAttribute('type')).toBe('button');
	expect(el(ThemeTrigger).hasAttribute('aria-expanded')).toBe(false);
	expect(el(ThemeTrigger).hasAttribute('aria-controls')).toBe(false);
});

test('CSR: a bar control outside every navbar is still a plain button', async () => {
	await render(BarControls);
	expect(el(OutsideTrigger).tagName).toBe('BUTTON');
	expect(el(OutsideTrigger).getAttribute('type')).toBe('button');
});

test("SSR: a server-rendered bar walks to its control, and that control's click runs after resume", async () => {
	await renderSSR(BarControls);
	el(Brand).focus();

	await userEvent.keyboard('{ArrowRight}');
	await expect.poll(() => document.activeElement).toBe(el(DocsTrigger));
	await userEvent.keyboard('{ArrowRight}');
	await expect.poll(() => document.activeElement).toBe(el(ThemeTrigger));
	await userEvent.keyboard('{End}');
	await expect.poll(() => document.activeElement).toBe(el(CtaLink));

	el(ThemeTrigger).click();
	await expect.poll(() => el(Presses).textContent).toBe('1');
	expect(el(Root).hasAttribute('ui-open')).toBe(false);
});
