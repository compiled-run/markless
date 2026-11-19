import { userEvent } from 'vite-plus/test/browser';
import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../../src/index.ts';
import ArmTags from './arm-tags.tsrx';
import NamedRows from './named-rows.tsrx';
import SeatGrid from './seat-grid.tsrx';
import SpanRows from './span-rows.tsrx';

afterEach(cleanup);

const at = (selector: string) => document.querySelector<HTMLElement>(selector)!;
const seats = () => [...document.querySelectorAll<HTMLElement>('[data-seat]')];
const pressed = () =>
	seats().map((seat) => `${seat.dataset.seat}:${seat.getAttribute('aria-pressed')}`);

async function pinSeatGrid() {
	const before = seats();
	expect(pressed()).toEqual([
		'0-0:false',
		'0-1:false',
		'0-2:false',
		'1-0:false',
		'1-1:false',
		'1-2:false',
	]);

	await userEvent.click(at('[data-seat="1-2"]'));
	await expect.poll(() => at('[data-seat="1-2"]').getAttribute('aria-pressed')).toBe('true');
	expect(pressed()).toEqual([
		'0-0:false',
		'0-1:false',
		'0-2:false',
		'1-0:false',
		'1-1:false',
		'1-2:true',
	]);
	expect(seats()).toEqual(before);

	await userEvent.click(at('[data-seat="0-0"]'));
	await expect.poll(() => at('[data-seat="0-0"]').getAttribute('aria-pressed')).toBe('true');
	expect(seats()).toEqual(before);

	await userEvent.click(at('[data-clear]'));
	await expect.poll(() => pressed().filter((seat) => seat.endsWith(':true'))).toEqual([]);
	expect(seats()).toEqual(before);

	await userEvent.click(at('[data-add]'));
	await expect.poll(() => seats().length).toBe(8);
	expect(pressed().slice(6)).toEqual(['2-0:false', '2-1:true']);
	expect(seats().map((seat) => seat.textContent)).toEqual([
		'A1',
		'A2',
		'A3',
		'B1',
		'B2',
		'B3',
		'C1',
		'C2',
	]);
	await userEvent.click(at('[data-seat="2-0"]'));
	await expect.poll(() => at('[data-seat="2-0"]').getAttribute('aria-pressed')).toBe('true');
	expect(seats().slice(0, 6)).toEqual(before);

	// Rows keyed by position: the slots stay, and each shows the row now at its position.
	await userEvent.click(at('[data-drop]'));
	await expect
		.poll(pressed)
		.toEqual(['0-0:false', '0-1:false', '0-2:false', '1-0:true', '1-1:true']);
	expect(seats().map((seat) => seat.textContent)).toEqual(['A1', 'A2', 'A3', 'B1', 'B2']);
	await userEvent.click(at('[data-seat="1-1"]'));
	await expect
		.poll(pressed)
		.toEqual(['0-0:false', '0-1:false', '0-2:false', '1-0:true', '1-1:false']);
	await userEvent.click(at('[data-seat="0-1"]'));
	await expect
		.poll(pressed)
		.toEqual(['0-0:false', '0-1:true', '0-2:false', '1-0:true', '1-1:false']);
}

test('CSR: a seat in a grid of rows keyed by position toggles alone, and Clear resets every row', async () => {
	await render(SeatGrid);
	await pinSeatGrid();
});

test('SSR: a seat in a grid of rows keyed by position toggles alone on the first click, and Clear resets every row', async () => {
	await renderSSR(SeatGrid);
	await pinSeatGrid();
});

async function pinSpanRows() {
	const before = seats();
	expect(pressed()).toEqual(['A1:false', 'A2:false', 'B1:false', 'B2:false']);
	await userEvent.click(at('[data-seat="B2"]'));
	await expect.poll(pressed).toEqual(['A1:false', 'A2:false', 'B1:false', 'B2:true']);
	await userEvent.click(at('[data-seat="A1"]'));
	await expect.poll(pressed).toEqual(['A1:true', 'A2:false', 'B1:false', 'B2:true']);
	expect(seats()).toEqual(before);
}

test('CSR: a seat in an inner list over a property of a row keyed by data toggles alone', async () => {
	await render(SpanRows);
	await pinSpanRows();
});

test('SSR: a seat in an inner list over a property of a row keyed by data toggles alone on the first click', async () => {
	await renderSSR(SpanRows);
	await pinSpanRows();
});

const rowTexts = () =>
	[...document.querySelectorAll<HTMLElement>('[data-row]')].map(
		(row) => `${row.dataset.row}:${row.textContent}`,
	);

async function pinArmTags() {
	expect(rowTexts()).toEqual(['a:none', 'b:none']);
	await userEvent.click(at('[data-toggle]'));
	await expect.poll(rowTexts).toEqual(['a:xy', 'b:z']);
	await userEvent.click(at('[data-tag="b0"]'));
	await expect.poll(rowTexts).toEqual(['a:xy', 'b:zz']);
	await userEvent.click(at('[data-add]'));
	await expect.poll(rowTexts).toEqual(['a:xy', 'b:zz', 'c:w']);
	await userEvent.click(at('[data-tag="c0"]'));
	await expect.poll(rowTexts).toEqual(['a:xy', 'b:zz', 'c:ww']);
	await userEvent.click(at('[data-toggle]'));
	await expect.poll(rowTexts).toEqual(['a:none', 'b:none', 'c:none']);
	await userEvent.click(at('[data-toggle]'));
	await expect.poll(rowTexts).toEqual(['a:xy', 'b:zz', 'c:ww']);
	await userEvent.click(at('[data-tag="a1"]'));
	await expect.poll(rowTexts).toEqual(['a:xyy', 'b:zz', 'c:ww']);
}

test('CSR: an inner list keyed by position inside a row @if arm is rebuilt with the arm', async () => {
	await render(ArmTags);
	await pinArmTags();
});

test('SSR: an inner list keyed by position inside a row @if arm is rebuilt with the arm', async () => {
	await renderSSR(ArmTags);
	await pinArmTags();
});

const states = () =>
	[...document.querySelectorAll<HTMLElement>('[data-seat]')].map(
		(seat) => `${seat.dataset.seat}:${seat.textContent}`,
	);

async function pinNamedRows() {
	const before = seats();
	expect(states()).toEqual(['A1:on', 'A2:off', 'B1:on', 'B2:on']);
	await userEvent.click(at('[data-clear]'));
	await expect.poll(() => at('[data-cleared]').textContent).toBe('1');
	await expect.poll(states).toEqual(['A1:off', 'A2:off', 'B1:off', 'B2:off']);
	await userEvent.click(at('[data-pick-last]'));
	await expect.poll(states).toEqual(['A1:off', 'A2:on', 'B1:off', 'B2:on']);
	expect(seats()).toEqual(before);
}

test('CSR: a nested for...of writes each inner element of each row', async () => {
	await render(NamedRows);
	await pinNamedRows();
});

test('SSR: a nested for...of writes each inner element of each row on the first click', async () => {
	await renderSSR(NamedRows);
	await pinNamedRows();
});
