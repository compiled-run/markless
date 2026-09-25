import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../src/index.ts';
import App from './fixtures/text-beside-elements.tsrx';

// A text hole that shares its element with child elements updates only its own
// text: the elements beside it survive every write.
afterEach(() => cleanup());

const q = (container: ParentNode, selector: string) =>
	container.querySelector<HTMLElement>(selector);

function snapshot(container: ParentNode) {
	return {
		lead: q(container, '[data-lead]')?.textContent,
		mark: q(container, '[data-lead] > b[data-mark]') !== null,
		trail: q(container, '[data-trail]')?.textContent,
		icon: q(container, '[data-trail] > i[data-icon]') !== null,
		both: q(container, '[data-both]')?.textContent,
		mid: q(container, '[data-both] > u[data-mid]') !== null,
		twice: q(container, '[data-twice]')?.textContent,
		empty: q(container, '[data-empty]')?.textContent,
		after: q(container, '[data-empty] > b[data-after]') !== null,
		end: q(container, '[data-end]')?.textContent,
		glyph: q(container, '[data-end] > i[data-glyph]') !== null,
		last: q(container, '[data-end] > b[data-last]') !== null,
		box: q(container, '[data-box]')?.textContent,
		caret: q(container, '[data-box] > em[data-caret]') !== null,
		rows: Array.from(container.querySelectorAll('[data-row]')).map((row) => [
			row.textContent,
			row.querySelector('s[data-row-mark]') !== null,
		]),
	};
}

async function expectElementsSurvive(container: ParentNode) {
	expect(snapshot(container)).toEqual({
		lead: '0!',
		mark: true,
		trail: '*0',
		icon: true,
		both: 'n=0|tail',
		mid: true,
		twice: '0|0',
		empty: '.',
		after: true,
		end: '+0.',
		glyph: true,
		last: true,
		box: '0',
		caret: true,
		rows: [['0~', true]],
	});

	q(container, '[data-bump]')?.click();
	await expect.poll(() => q(container, '[data-lead]')?.textContent).toBe('1!');
	await expect
		.poll(() => snapshot(container))
		.toEqual({
			lead: '1!',
			mark: true,
			trail: '*1',
			icon: true,
			both: 'n=1|tail',
			mid: true,
			twice: '1|1',
			empty: 'x.',
			after: true,
			end: '+1.',
			glyph: true,
			last: true,
			box: '1',
			caret: true,
			rows: [['1~', true]],
		});

	q(container, '[data-add]')?.click();
	await expect.poll(() => snapshot(container).rows.length).toBe(2);
	q(container, '[data-bump]')?.click();
	await expect
		.poll(() => snapshot(container))
		.toEqual({
			lead: '2!',
			mark: true,
			trail: '*2',
			icon: true,
			both: 'n=2|tail',
			mid: true,
			twice: '2|2',
			empty: 'xx.',
			after: true,
			end: '+2.',
			glyph: true,
			last: true,
			box: '2',
			caret: true,
			rows: [
				['2~', true],
				['2~', true],
			],
		});
}

test('CSR: a text hole beside child elements leaves those elements in place', async () => {
	const screen = await render(App);
	await expectElementsSurvive(screen.container as HTMLElement);
});

test('SSR resume: a served text hole beside child elements leaves those elements in place', async () => {
	const screen = await renderSSR(App);
	await expectElementsSurvive(screen.container);
});
