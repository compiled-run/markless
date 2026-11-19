import type { ScrollBox, ScrollVectorCase } from '../src/scroll.ts';
import { FOCUS_INTO_VIEW, SCROLL_INTO_VIEW } from '../src/scroll.ts';

// A 400 by 700 page whose content is 3500 tall, holding a 300 tall box at y 200 whose content is 2040 tall.
const page = (y = 0, maxY = 2800): ScrollBox => ({
	port: { x: 0, y: 0, width: 400, height: 700 },
	offset: { x: 0, y },
	range: { minX: 0, maxX: 0, minY: 0, maxY },
});
const box = (y = 0, at = 200): ScrollBox => ({
	port: { x: 0, y: at, width: 400, height: 300 },
	offset: { x: 0, y },
	range: { minX: 0, maxX: 0, minY: 0, maxY: 1740 },
});
const row = (y: number) => ({ x: 0, y, width: 400, height: 40 });
const strip: ScrollBox = {
	port: { x: 0, y: 100, width: 400, height: 150 },
	offset: { x: 0, y: 0 },
	range: { minX: 0, maxX: 1600, minY: 0, maxY: 0 },
};

export const SCROLL_CASES: readonly ScrollVectorCase[] = [
	{
		name: 'scrollIntoView: a row below a box scrolls the box to it, then the page to the box',
		chain: [box(), page()],
		target: row(1000),
		align: SCROLL_INTO_VIEW,
	},
	{
		name: 'scrollIntoView nearest: the row comes in at the bottom of the box',
		chain: [box(), page()],
		target: row(1000),
		align: { block: 'nearest', inline: 'nearest' },
	},
	{
		name: 'focus: a hidden row is centred in the box, and the box already shows on the page',
		chain: [box(), page()],
		target: row(1000),
		align: FOCUS_INTO_VIEW,
	},
	{
		name: 'focus: a row cut by the box bottom moves up to its closest edge',
		chain: [box(720), page()],
		target: row(1000),
		align: FOCUS_INTO_VIEW,
	},
	{
		name: 'focus: a row the box already shows does not scroll',
		chain: [box(800), page()],
		target: row(1000),
		align: FOCUS_INTO_VIEW,
	},
	{
		name: 'scrollIntoView on the page: a row far down comes to the top',
		chain: [page()],
		target: row(2000),
		align: SCROLL_INTO_VIEW,
	},
	{
		name: 'scrollIntoView on the page: the last row stops at the end of the range',
		chain: [page()],
		target: row(3460),
		align: SCROLL_INTO_VIEW,
	},
	{
		name: 'scrollIntoView up: a row above the shown part comes to the top',
		chain: [page(2400)],
		target: row(300),
		align: SCROLL_INTO_VIEW,
	},
	{
		name: 'scrollIntoView in a horizontal strip: a card to the right comes in at the right edge',
		chain: [strip, page()],
		target: { x: 1200, y: 0, width: 160, height: 150 },
		align: SCROLL_INTO_VIEW,
	},
	{
		name: 'focus: a hidden row in a box below the screen centres in the box, then the box on the page',
		chain: [box(0, 900), page()],
		target: row(1000),
		align: FOCUS_INTO_VIEW,
	},
];
