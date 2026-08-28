// Every recovery below is the gesture that family's own browser suite already
// pins, so a red recovery is a regression rather than this lane inventing a
// contract. Scenarios come from src/<family>/scenarios unchanged.

import { render } from '@markless/vitest-browser';
import { page, userEvent } from 'vite-plus/test/browser';
import { expect } from 'vitest';
import { dropOn, fileOf } from '../test-support/drag.ts';
import AccordionBasic from '../src/accordion/scenarios/basic.tsrx';
import ButtongroupBasic from '../src/buttongroup/scenarios/basic.tsrx';
import CalendarBasic from '../src/calendar/scenarios/basic.tsrx';
import CarouselBasic from '../src/carousel/scenarios/basic.tsrx';
import { installCarouselCss } from '../src/carousel/scenarios/carousel-css.ts';
import CheckboxBasic from '../src/checkbox/scenarios/basic.tsrx';
import ChecklistBasic from '../src/checklist/scenarios/basic.tsrx';
import CollapsibleBasic from '../src/collapsible/scenarios/basic.tsrx';
import ColorpickerBasic from '../src/colorpicker/scenarios/basic.tsrx';
import { Basic as ComboboxBasic } from '../src/combobox/scenarios/basic.tsrx';
import CropBasic from '../src/crop/scenarios/basic.tsrx';
import DateboxBasic from '../src/datebox/scenarios/basic.tsrx';
import DrawerBasic from '../src/drawer/scenarios/basic.tsrx';
import FileuploadBasic from '../src/fileupload/scenarios/basic.tsrx';
import HovercardBasic from '../src/hovercard/scenarios/basic.tsrx';
import InkBasic from '../src/ink/scenarios/basic.tsrx';
import MenuBasic from '../src/menu/scenarios/basic.tsrx';
import MenubarBasic from '../src/menubar/scenarios/basic.tsrx';
import ModalBasic from '../src/modal/scenarios/basic.tsrx';
import NavbarClickOnly from '../src/navbar/scenarios/click-only.tsrx';
import NumberboxBasic from '../src/numberbox/scenarios/basic.tsrx';
import OtpBasic from '../src/otp/scenarios/basic.tsrx';
import PadBasic from '../src/pad/scenarios/basic.tsrx';
import PaginationBasic from '../src/pagination/scenarios/basic.tsrx';
import PopoverBasic from '../src/popover/scenarios/basic.tsrx';
import { Basic as RadioGroupBasic } from '../src/radio-group/scenarios/basic.tsrx';
import { Basic as SelectBasic } from '../src/select/scenarios/basic.tsrx';
import SliderBasic from '../src/slider/scenarios/basic.tsrx';
import TabsBasic from '../src/tabs/scenarios/basic.tsrx';
import TextboxBasic from '../src/textbox/scenarios/basic.tsrx';
import ToasterBasic from '../src/toaster/scenarios/basic.tsrx';
import ToggleBasic from '../src/toggle/scenarios/basic.tsrx';
import ToolbarBasic from '../src/toolbar/scenarios/basic.tsrx';
import TooltipBasic from '../src/tooltip/scenarios/basic.tsrx';
import TourBasic from '../src/tour/scenarios/basic.tsrx';
import TreeNested from '../src/tree/scenarios/nested.tsrx';
import { type StormKind, tick } from './actions.ts';

export type ChaosFamily = {
	readonly name: string;
	/** Mounts the scenario. CSR only: the SSR marker cannot be reached by reference. */
	mount(): Promise<unknown>;
	/** The part every storm is aimed inside of. Omitted when the scenario's controls
	 *  sit outside the family root, in which case the storm takes the whole body. */
	readonly rootTestId?: string;
	/** Where a keyboard-only storm puts focus before its first keystroke. */
	readonly keyboardEntryTestId: string;
	/** Which storms this family gets. Two each, so the run stays bounded. */
	readonly storms: readonly StormKind[];
	/** Clears leftovers Escape alone does not, before recovery is measured. */
	unwind?(): Promise<void>;
	/** One scripted normal interaction, asserted after the storm. */
	recover(): Promise<void>;
};

function el<T extends Element = HTMLElement>(testid: string): T {
	const found = page.getByTestId(testid).element();
	if (!found) throw new Error(`Expected [data-testid="${testid}"] to be on the page.`);
	return found as unknown as T;
}

/** Every match, for the parts a scenario repeats (days, rows, boxes). */
function els(testid: string): HTMLElement[] {
	return page.getByTestId(testid).elements() as unknown as HTMLElement[];
}

function keyOn(target: Element, key: string): void {
	target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
}

/** A click with no click count, which is what Enter and Space on a button produce. */
function activate(target: Element): void {
	target.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, detail: 0 }));
}

let padPointerId = 9000;

function pointerAt(
	target: Element,
	type: string,
	x: number,
	y: number,
	buttons: number,
	pressure = 0.5,
): void {
	target.dispatchEvent(
		new PointerEvent(type, {
			bubbles: true,
			cancelable: true,
			composed: true,
			button: 0,
			buttons,
			clientX: x,
			clientY: y,
			pressure,
			pointerId: padPointerId,
			pointerType: 'mouse',
			isPrimary: true,
		}),
	);
}

/** The stroke ink's own suite draws: a press, twelve moves, a release. */
function drawStroke(area: Element): void {
	padPointerId += 1;
	const box = area.getBoundingClientRect();
	pointerAt(area, 'pointerdown', box.left + 20, box.top + 20, 1);
	for (let step = 1; step <= 12; step++) {
		pointerAt(area, 'pointermove', box.left + 20 + step * 8, box.top + 20 + step * 5, 1);
	}
	pointerAt(area, 'pointerup', box.left + 116, box.top + 80, 0);
}

/** A numberbox step trigger is driven by pointer down/up, not by click. */
function pressTrigger(target: Element): void {
	padPointerId += 1;
	const box = target.getBoundingClientRect();
	pointerAt(target, 'pointerdown', box.left + box.width / 2, box.top + box.height / 2, 1);
	pointerAt(target, 'pointerup', box.left + box.width / 2, box.top + box.height / 2, 0);
}

/** Drives a two-state control to `wanted` before the one measured press. */
async function driveTo(testid: string, attribute: string, wanted: string): Promise<void> {
	for (let attempt = 0; attempt < 3; attempt++) {
		if (el(testid).getAttribute(attribute) === wanted) return;
		el(testid).click();
		await tick(40);
	}
	await expect.poll(() => el(testid).getAttribute(attribute)).toBe(wanted);
}

/** The day one step on from an ISO date, which is where ArrowRight lands. */
function dayAfter(iso: string): string {
	const at = new Date(`${iso}T00:00:00Z`);
	at.setUTCDate(at.getUTCDate() + 1);
	return at.toISOString().slice(0, 10);
}

function rovingDay(): HTMLElement | undefined {
	const days = els('day');
	return days.find((day) => day.getAttribute('tabindex') === '0') ?? days[0];
}

export const families: readonly ChaosFamily[] = [
	{
		name: 'accordion',
		mount: () => render(AccordionBasic),
		rootTestId: 'root',
		keyboardEntryTestId: 'shipping-trigger',
		storms: ['keyboard', 'mixed'],
		async recover() {
			await driveTo('shipping-trigger', 'aria-expanded', 'false');

			el('shipping-trigger').click();
			await expect.poll(() => el('shipping-trigger').getAttribute('aria-expanded')).toBe('true');
			await expect.poll(() => el('shipping-content').hasAttribute('hidden')).toBe(false);
			expect(el('shipping-item').getAttribute('ui-open')).toBe('');
		},
	},
	{
		name: 'buttongroup',
		mount: () => render(ButtongroupBasic),
		rootTestId: 'root',
		keyboardEntryTestId: 'left',
		storms: ['keyboard', 'mixed'],
		async recover() {
			el<HTMLElement>('center').focus();

			await userEvent.keyboard('{End}');
			await expect.poll(() => document.activeElement).toBe(el('right'));

			await userEvent.keyboard('{Home}');
			await expect.poll(() => document.activeElement).toBe(el('left'));
		},
	},
	{
		name: 'calendar',
		mount: () => render(CalendarBasic),
		rootTestId: 'root',
		keyboardEntryTestId: 'back',
		storms: ['keyboard', 'mixed'],
		async recover() {
			// The storm can have paged to another month, so the arrow is measured
			// against the day that holds the roving stop rather than a fixed date.
			await expect.poll(() => els('day').length, { timeout: 5000 }).toBe(42);
			const stop = rovingDay();
			if (!stop) throw new Error('The calendar rendered no days.');
			const from = stop.getAttribute('value') ?? '';
			const next = dayAfter(from);
			stop.focus();

			await userEvent.keyboard('{ArrowRight}');
			await expect
				.poll(() => rovingDay()?.getAttribute('value'), { timeout: 5000 })
				.toBe(next);
			expect((document.activeElement as HTMLElement | null)?.getAttribute('value')).toBe(next);
		},
	},
	{
		name: 'carousel',
		mount: async () => {
			installCarouselCss();
			return render(CarouselBasic);
		},
		rootTestId: 'root',
		keyboardEntryTestId: 'backtrigger',
		storms: ['pointer', 'mixed'],
		async recover() {
			const active = () =>
				document.querySelector('[ui-active][ui-value]')?.getAttribute('ui-value') ?? '';

			// Three slides, and this carousel does not loop: three presses of back
			// land on the first one from wherever the storm left it.
			for (let step = 0; step < 3; step++) {
				el('backtrigger').click();
				await tick(40);
			}
			await expect.poll(active).toBe('paris');

			el('forwardtrigger').click();
			await expect.poll(active).toBe('oslo');

			el('backtrigger').click();
			await expect.poll(active).toBe('paris');
		},
	},
	{
		name: 'checkbox',
		mount: () => render(CheckboxBasic),
		rootTestId: 'root',
		keyboardEntryTestId: 'trigger',
		storms: ['pointer', 'mixed'],
		async recover() {
			await driveTo('trigger', 'aria-checked', 'false');

			el('trigger').click();
			await expect.poll(() => el('trigger').getAttribute('aria-checked')).toBe('true');
			expect(el('root').getAttribute('ui-checked')).toBe('');

			el('trigger').click();
			await expect.poll(() => el('trigger').getAttribute('aria-checked')).toBe('false');
			expect(el('root').hasAttribute('ui-checked')).toBe(false);
		},
	},
	{
		name: 'checklist',
		mount: () => render(ChecklistBasic),
		rootTestId: 'root',
		keyboardEntryTestId: 'lettuce-trigger',
		storms: ['pointer', 'mixed'],
		async recover() {
			await driveTo('lettuce-trigger', 'aria-checked', 'false');
			const tomato = el('tomato-trigger').getAttribute('aria-checked');
			const mustard = el('mustard-trigger').getAttribute('aria-checked');

			el('lettuce-trigger').click();
			await expect.poll(() => el('lettuce-trigger').getAttribute('aria-checked')).toBe('true');
			expect(el('tomato-trigger').getAttribute('aria-checked')).toBe(tomato);
			expect(el('mustard-trigger').getAttribute('aria-checked')).toBe(mustard);
		},
	},
	{
		name: 'collapsible',
		mount: () => render(CollapsibleBasic),
		rootTestId: 'root',
		keyboardEntryTestId: 'trigger',
		storms: ['pointer', 'mixed'],
		async recover() {
			await driveTo('trigger', 'aria-expanded', 'false');

			el('trigger').click();
			await expect.poll(() => el('trigger').getAttribute('aria-expanded')).toBe('true');
			expect(el('content').hasAttribute('hidden')).toBe(false);
			expect(el('root').getAttribute('ui-open')).toBe('');

			el('trigger').click();
			await expect.poll(() => el('trigger').getAttribute('aria-expanded')).toBe('false');
			expect(el('content').getAttribute('hidden')).toBe('until-found');
		},
	},
	{
		name: 'colorpicker',
		mount: () => render(ColorpickerBasic),
		rootTestId: 'root',
		keyboardEntryTestId: 'hue-thumb',
		storms: ['pointer', 'mixed'],
		async recover() {
			// Home takes the rail to its own end, so the step after it is the same
			// number whatever the storm's drags left behind.
			el<HTMLElement>('hue-thumb').focus();
			await userEvent.keyboard('{Home}');
			await expect.poll(() => el('hue-thumb').getAttribute('aria-valuenow')).toBe('0');

			await userEvent.keyboard('{ArrowRight}');
			await expect.poll(() => el('hue-thumb').getAttribute('aria-valuenow')).toBe('1');
		},
	},
	{
		name: 'combobox',
		mount: () => render(ComboboxBasic),
		rootTestId: 'root',
		keyboardEntryTestId: 'input',
		storms: ['keyboard', 'mixed'],
		async recover() {
			el('trigger').click();
			await expect.poll(() => el('input').getAttribute('aria-expanded')).toBe('true');
			await expect.poll(() => el<HTMLElement>('content').hidden).toBe(false);
			await expect.poll(() => document.activeElement).toBe(el('input'));

			el('trigger').click();
			await expect.poll(() => el('input').getAttribute('aria-expanded')).toBe('false');
			await expect.poll(() => el<HTMLElement>('content').hidden).toBe(true);
		},
	},
	{
		name: 'crop',
		mount: () => render(CropBasic),
		rootTestId: 'root',
		keyboardEntryTestId: 'selection',
		storms: ['pointer', 'mixed'],
		async recover() {
			const x = () => Number(el<HTMLInputElement>('field').value.split(',')[0]);

			// Home is the inline axis until an arrow says otherwise, so the
			// rectangle starts flush against the area's start edge either way.
			keyOn(el('selection'), 'Home');
			await expect.poll(x).toBe(0);

			keyOn(el('selection'), 'ArrowRight');
			await expect.poll(x).toBe(1);
		},
	},
	{
		name: 'datebox',
		mount: () => render(DateboxBasic),
		rootTestId: 'root',
		keyboardEntryTestId: 'monthinput',
		storms: ['keyboard', 'mixed'],
		async recover() {
			el<HTMLElement>('monthinput').focus();
			await userEvent.keyboard('{Home}');
			await expect.poll(() => el('monthinput').textContent).toBe('1');

			await userEvent.keyboard('{End}');
			await expect.poll(() => el('monthinput').textContent).toBe('12');
		},
	},
	{
		name: 'drawer',
		mount: () => render(DrawerBasic),
		rootTestId: 'root',
		keyboardEntryTestId: 'trigger',
		storms: ['keyboard', 'mixed'],
		async unwind() {
			if (!el('backdrop').hasAttribute('hidden')) el('close').click();
			await tick(40);
		},
		async recover() {
			el('trigger').click();
			await expect.poll(() => el('backdrop').hasAttribute('hidden')).toBe(false);
			await expect.poll(() => document.activeElement).toBe(el('content'));

			el('close').click();
			await expect.poll(() => el('backdrop').hasAttribute('hidden')).toBe(true);
			await expect.poll(() => document.activeElement).toBe(el('trigger'));
			expect(document.body.style.overflow).toBe('');
		},
	},
	{
		name: 'fileupload',
		mount: () => render(FileuploadBasic),
		rootTestId: 'root',
		keyboardEntryTestId: 'trigger',
		storms: ['pointer', 'mixed'],
		async unwind() {
			for (const close of els('itemclose')) close.click();
			await tick(40);
		},
		async recover() {
			dropOn(el('droparea'), fileOf('notes.txt'));
			await expect.poll(() => els('itemlabel').map((row) => row.textContent)).toEqual([
				'notes.txt',
			]);
			await expect
				.poll(() => [...(el<HTMLInputElement>('field').files ?? [])].map((one) => one.name))
				.toEqual(['notes.txt']);
			expect(el('droparea').hasAttribute('ui-dragging')).toBe(false);
		},
	},
	{
		name: 'hovercard',
		mount: () => render(HovercardBasic),
		rootTestId: 'root',
		keyboardEntryTestId: 'trigger',
		storms: ['pointer', 'mixed'],
		async recover() {
			// The card waits out its open delay on focus exactly as it does on hover.
			el<HTMLElement>('trigger').focus();
			await expect.poll(() => el('content').hasAttribute('hidden'), { timeout: 2000 }).toBe(false);
			await expect.poll(() => el('trigger').getAttribute('aria-expanded')).toBe('true');
		},
	},
	{
		name: 'ink',
		mount: () => render(InkBasic),
		rootTestId: 'root',
		keyboardEntryTestId: 'area',
		storms: ['pointer', 'mixed'],
		async recover() {
			const value = () => el<HTMLInputElement>('field').value;
			const before = value();

			drawStroke(el('area'));
			await expect.poll(() => value()).not.toBe(before);
			expect(value().endsWith('Z')).toBe(true);
			expect(el('root').hasAttribute('ui-empty')).toBe(false);
		},
	},
	{
		name: 'menu',
		mount: () => render(MenuBasic),
		rootTestId: 'root',
		keyboardEntryTestId: 'trigger',
		storms: ['keyboard', 'mixed'],
		async recover() {
			el('trigger').focus();
			activate(el('trigger'));
			await expect.poll(() => el('content').hasAttribute('hidden')).toBe(false);
			await expect.poll(() => document.activeElement).toBe(el('item-cut'));

			keyOn(el('item-cut'), 'ArrowDown');
			await expect.poll(() => document.activeElement).toBe(el('item-copy'));
		},
	},
	{
		name: 'menubar',
		mount: () => render(MenubarBasic),
		rootTestId: 'root',
		keyboardEntryTestId: 'bar-file',
		storms: ['keyboard', 'mixed'],
		async recover() {
			el<HTMLElement>('bar-edit').focus();
			keyOn(el('bar-edit'), 'Enter');
			await expect.poll(() => el('panel-edit').hasAttribute('hidden')).toBe(false);
			await expect.poll(() => document.activeElement).toBe(el('item-undo'));

			keyOn(el('item-undo'), 'Escape');
			await expect.poll(() => el('panel-edit').hasAttribute('hidden')).toBe(true);
			await expect.poll(() => document.activeElement).toBe(el('bar-edit'));
		},
	},
	{
		name: 'modal',
		mount: () => render(ModalBasic),
		rootTestId: 'root',
		keyboardEntryTestId: 'trigger',
		storms: ['keyboard', 'mixed'],
		async unwind() {
			// A dialog the storm reopened after the last Escape leaves its own
			// trigger inert, so recovery would fail on leftovers, not a defect.
			if (!el('backdrop').hasAttribute('hidden')) el('close').click();
			await tick(40);
		},
		async recover() {
			el('trigger').click();
			await expect.poll(() => el('backdrop').hasAttribute('hidden')).toBe(false);
			await expect.poll(() => el('content').contains(document.activeElement)).toBe(true);
			expect(el('root').getAttribute('ui-open')).toBe('');
			expect(document.body.style.overflow).toBe('hidden');

			el('close').click();
			await expect.poll(() => el('backdrop').hasAttribute('hidden')).toBe(true);
			await expect.poll(() => el('content').hasAttribute('hidden')).toBe(true);
			expect(document.body.style.overflow).toBe('');
		},
	},
	{
		name: 'navbar',
		mount: () => render(NavbarClickOnly),
		rootTestId: 'root',
		keyboardEntryTestId: 'products-itemtrigger',
		storms: ['pointer', 'mixed'],
		async recover() {
			await driveTo('products-itemtrigger', 'aria-expanded', 'false');

			el('products-itemtrigger').click();
			await expect
				.poll(() => el('products-itemtrigger').getAttribute('aria-expanded'))
				.toBe('true');
			expect(el('products-itemcontent').hasAttribute('hidden')).toBe(false);
			expect(el('products-item').getAttribute('ui-open')).toBe('');

			el('products-itemtrigger').click();
			await expect
				.poll(() => el('products-itemtrigger').getAttribute('aria-expanded'))
				.toBe('false');
			expect(el('products-itemcontent').hasAttribute('hidden')).toBe(true);
		},
	},
	{
		name: 'numberbox',
		mount: () => render(NumberboxBasic),
		rootTestId: 'root',
		keyboardEntryTestId: 'input',
		storms: ['keyboard', 'mixed'],
		async recover() {
			const shown = () => el<HTMLInputElement>('input').value;

			// An empty field starts from the bound it steps away from, so clearing
			// first makes the two steps below the same numbers every run.
			await userEvent.clear(el<HTMLInputElement>('input'));
			await expect.poll(shown).toBe('');

			pressTrigger(el('forwardtrigger'));
			await expect.poll(shown).toBe('0');
			await expect.poll(() => document.activeElement).toBe(el('input'));

			pressTrigger(el('forwardtrigger'));
			await expect.poll(shown).toBe('1');

			pressTrigger(el('backtrigger'));
			await expect.poll(shown).toBe('0');
		},
	},
	{
		name: 'otp',
		mount: () => render(OtpBasic),
		rootTestId: 'root',
		keyboardEntryTestId: 'field',
		storms: ['keyboard', 'mixed'],
		async recover() {
			const field = el<HTMLInputElement>('field');
			const painted = () =>
				[0, 1, 2, 3, 4, 5].map((box) => el(`item-${box}`).textContent ?? '').join('');
			field.focus();
			// Backspace takes the last character back out of its box: six of them
			// empty a six-box code however far the storm filled it.
			for (let box = 0; box < 6; box++) await userEvent.keyboard('{Backspace}');
			// The boxes are the committed write; the browser empties the field before
			// any handler runs, so polling it first passes while the boxes are stale.
			await expect.poll(painted).toBe('');
			expect(field.value).toBe('');

			await userEvent.keyboard('4');
			await expect.poll(() => el('item-0').textContent).toBe('4');
			expect(el('item-1').getAttribute('ui-empty')).toBe('');
			expect(field.value).toBe('4');
		},
	},
	{
		name: 'pad',
		mount: () => render(PadBasic),
		rootTestId: 'root',
		keyboardEntryTestId: 'thumb',
		storms: ['pointer', 'mixed'],
		async recover() {
			const now = () => el('thumb').getAttribute('aria-valuenow');

			// Home and End follow the axis the last arrow used, so one arrow puts
			// the handle back on x before the end it is sent to is read.
			el<HTMLElement>('thumb').focus();
			await userEvent.keyboard('{ArrowLeft}');
			await userEvent.keyboard('{Home}');
			await expect.poll(now).toBe('0');

			await userEvent.keyboard('{ArrowRight}');
			await expect.poll(now).toBe('0.01');
		},
	},
	{
		name: 'pagination',
		mount: () => render(PaginationBasic),
		rootTestId: 'root',
		keyboardEntryTestId: 'itemtrigger-1',
		storms: ['pointer', 'mixed'],
		async recover() {
			el('itemtrigger-1').click();
			await expect.poll(() => el('itemtrigger-1').getAttribute('aria-current')).toBe('page');

			el('forwardtrigger').click();
			await expect.poll(() => el('itemtrigger-2').getAttribute('aria-current')).toBe('page');
			expect(el('itemtrigger-1').hasAttribute('aria-current')).toBe(false);

			el('backtrigger').click();
			await expect.poll(() => el('itemtrigger-1').getAttribute('aria-current')).toBe('page');
		},
	},
	{
		name: 'popover',
		mount: () => render(PopoverBasic),
		rootTestId: 'root',
		keyboardEntryTestId: 'trigger',
		storms: ['keyboard', 'mixed'],
		async unwind() {
			if (!el('content').hasAttribute('hidden')) el('close').click();
			await tick(40);
		},
		async recover() {
			el('trigger').click();
			await expect.poll(() => el('content').hasAttribute('hidden')).toBe(false);
			await expect.poll(() => el('trigger').getAttribute('aria-expanded')).toBe('true');
			expect(el('root').getAttribute('ui-open')).toBe('');

			el('close').click();
			await expect.poll(() => el('content').hasAttribute('hidden')).toBe(true);
			await expect.poll(() => el('trigger').getAttribute('aria-expanded')).toBe('false');
		},
	},
	{
		name: 'radio-group',
		mount: () => render(RadioGroupBasic),
		rootTestId: 'root',
		keyboardEntryTestId: 'monthly-field',
		storms: ['keyboard', 'mixed'],
		async recover() {
			el<HTMLElement>('monthly-field').focus();

			await userEvent.keyboard('{ArrowDown}');
			await expect.poll(() => document.activeElement).toBe(el('annual-field'));
			await expect.poll(() => el('annual-indicator').textContent).toBe('Chosen');
			expect(el('monthly-indicator').textContent).toBe('');

			await userEvent.keyboard('{ArrowUp}');
			await expect.poll(() => document.activeElement).toBe(el('monthly-field'));
			await expect.poll(() => el('monthly-indicator').textContent).toBe('Chosen');
		},
	},
	{
		name: 'select',
		mount: () => render(SelectBasic),
		rootTestId: 'root',
		keyboardEntryTestId: 'trigger',
		storms: ['keyboard', 'mixed'],
		async recover() {
			el('trigger').click();
			await expect.poll(() => el('trigger').getAttribute('aria-expanded')).toBe('true');
			await expect.poll(() => el<HTMLElement>('content').hidden).toBe(false);

			// Choosing what is already chosen is not a change, so recovery always
			// picks an option the storm left unselected.
			const fresh = el('apple').getAttribute('aria-selected') === 'true' ? 'banana' : 'apple';
			el(fresh).click();
			await expect.poll(() => el(fresh).getAttribute('aria-selected')).toBe('true');
			await expect.poll(() => el<HTMLElement>('content').hidden).toBe(true);
		},
	},
	{
		name: 'slider',
		mount: () => render(SliderBasic),
		rootTestId: 'root',
		keyboardEntryTestId: 'thumb',
		storms: ['pointer', 'mixed'],
		async recover() {
			// Value-relative assertions would depend on where the storm left the
			// thumb, so recovery drives it to a known end first.
			el<HTMLElement>('thumb').focus();
			await userEvent.keyboard('{Home}');
			await expect.poll(() => el('thumb').getAttribute('aria-valuenow')).toBe('0');

			await userEvent.keyboard('{ArrowRight}');
			await expect.poll(() => el('thumb').getAttribute('aria-valuenow')).toBe('1');
			expect(el('valuelabel').textContent?.trim()).toBe('1');
		},
	},
	{
		name: 'tabs',
		mount: () => render(TabsBasic),
		rootTestId: 'root',
		keyboardEntryTestId: 'overview-trigger',
		storms: ['keyboard', 'mixed'],
		async recover() {
			el('overview-trigger').click();
			await expect.poll(() => el('overview-trigger').getAttribute('aria-selected')).toBe('true');

			el<HTMLElement>('overview-trigger').focus();
			await userEvent.keyboard('{ArrowRight}');
			await expect.poll(() => document.activeElement).toBe(el('usage-trigger'));
			await expect.poll(() => el('usage-trigger').getAttribute('aria-selected')).toBe('true');
			await expect.poll(() => el('usage-content').hasAttribute('hidden')).toBe(false);
			expect(el('overview-content').hasAttribute('hidden')).toBe(true);
			expect(el('overview-trigger').getAttribute('tabindex')).toBe('-1');
		},
	},
	{
		name: 'textbox',
		mount: () => render(TextboxBasic),
		rootTestId: 'root',
		keyboardEntryTestId: 'input',
		storms: ['keyboard', 'mixed'],
		async recover() {
			await userEvent.fill(el<HTMLInputElement>('input'), 'test user');
			expect(el<HTMLInputElement>('input').value).toBe('test user');
			await expect.poll(() => el('root').hasAttribute('ui-empty')).toBe(false);

			await userEvent.clear(el<HTMLInputElement>('input'));
			await expect.poll(() => el('root').getAttribute('ui-empty')).toBe('');
		},
	},
	{
		name: 'toaster',
		// The buttons that say something sit outside the region, so the storm
		// takes the whole mount rather than the family root.
		mount: () => render(ToasterBasic),
		keyboardEntryTestId: 'save',
		storms: ['pointer', 'mixed'],
		async unwind() {
			for (const close of document.querySelectorAll<HTMLElement>('[ui-toastclose]')) {
				close.click();
			}
			await tick(40);
		},
		async recover() {
			const titles = () => els('itemtitle').map((one) => one.textContent);

			el('sticky').click();
			await expect.poll(titles).toEqual(['Upload failed']);
			expect(el('root').querySelectorAll('[ui-toast]')).toHaveLength(1);

			els('itemclose')[0]?.click();
			await expect.poll(titles).toEqual([]);
		},
	},
	{
		name: 'toggle',
		mount: () => render(ToggleBasic),
		rootTestId: 'root',
		keyboardEntryTestId: 'trigger',
		storms: ['pointer', 'mixed'],
		async recover() {
			await driveTo('trigger', 'aria-checked', 'false');

			el('trigger').click();
			await expect.poll(() => el('trigger').getAttribute('aria-checked')).toBe('true');

			el('trigger').click();
			await expect.poll(() => el('trigger').getAttribute('aria-checked')).toBe('false');
		},
	},
	{
		name: 'toolbar',
		mount: () => render(ToolbarBasic),
		rootTestId: 'root',
		keyboardEntryTestId: 'copy',
		storms: ['keyboard', 'mixed'],
		async recover() {
			el<HTMLElement>('copy').focus();
			await expect.poll(() => document.activeElement).toBe(el('copy'));

			await userEvent.keyboard('{ArrowRight}');
			await expect.poll(() => document.activeElement).toBe(el('cut'));
			await expect.poll(() => el('cut').getAttribute('tabindex')).toBe('0');
			expect(el('copy').getAttribute('tabindex')).toBe('-1');

			await userEvent.keyboard('{ArrowLeft}');
			await expect.poll(() => document.activeElement).toBe(el('copy'));
		},
	},
	{
		name: 'tooltip',
		mount: () => render(TooltipBasic),
		rootTestId: 'root',
		keyboardEntryTestId: 'trigger',
		storms: ['pointer', 'mixed'],
		async recover() {
			el<HTMLElement>('background').focus();
			await expect.poll(() => el('content').hasAttribute('hidden')).toBe(true);

			el<HTMLElement>('trigger').focus();
			await expect.poll(() => el('content').hasAttribute('hidden'), { timeout: 500 }).toBe(false);

			el<HTMLElement>('background').focus();
			await expect.poll(() => el('content').hasAttribute('hidden')).toBe(true);
		},
	},
	{
		name: 'tour',
		// The button that starts the tour sits outside the root, so the storm
		// takes the whole mount rather than the family root.
		mount: () => render(TourBasic),
		keyboardEntryTestId: 'start',
		storms: ['keyboard', 'mixed'],
		async unwind() {
			for (const card of ['save', 'share', 'trash']) {
				const close = page.getByTestId(`${card}-close`).elements()[0] as HTMLElement | undefined;
				if (close && !el(`step-${card}`).hasAttribute('hidden')) close.click();
			}
			await tick(40);
		},
		async recover() {
			el('start').click();
			await expect.poll(() => el('step-save').hasAttribute('hidden')).toBe(false);
			expect(el('step-share').hasAttribute('hidden')).toBe(true);
			expect(el('backdrop').hasAttribute('hidden')).toBe(false);

			el('save-forward').click();
			await expect.poll(() => el('step-share').hasAttribute('hidden')).toBe(false);
			expect(el('step-save').hasAttribute('hidden')).toBe(true);

			el('share-close').click();
			await expect.poll(() => el('backdrop').hasAttribute('hidden')).toBe(true);
		},
	},
	{
		name: 'tree',
		mount: () => render(TreeNested),
		rootTestId: 'root',
		keyboardEntryTestId: 'root',
		storms: ['keyboard', 'mixed'],
		async recover() {
			// The node may be open or closed after a storm; drive it to closed first
			// so the one gesture measured here is always an open.
			if (el('src-item').getAttribute('aria-expanded') === 'true') {
				el('src-itemtrigger').click();
				await expect.poll(() => el('src-item').hasAttribute('aria-expanded')).toBe(false);
			}

			el('src-itemtrigger').click();
			await expect.poll(() => el('src-item').getAttribute('aria-expanded')).toBe('true');
			await expect.poll(() => el('src-itemcontent').hasAttribute('hidden')).toBe(false);
			expect(el('index-item').getAttribute('aria-level')).toBe('2');
		},
	},
];
