import { computed, state } from '@markless/core';
import { load, note } from './loader.ts';

export function SequentialP() @{
	let x = state('x1');
	let y = state('y1');
	const both = computed(async ({ signal }) => {
		note('both');
		const a = await load('a:' + x, 'A', signal);
		const b = await load('b:' + y, 'B', signal);
		return a + b;
	});
	const left = computed(async ({ signal }) => {
		note('left');
		return await load('left:' + x, 'L', signal);
	});
	const right = computed(async ({ signal }) => {
		note('right');
		return await load('right:' + y, 'R', signal);
	});
	<div>
		@try { <output data-o>{both}</output> } @pending { <p data-p>loading</p> } @catch { <p data-e>err</p> }
		@try { <output data-split>{left + right}</output> } @pending { <p>loading</p> } @catch { <p>err</p> }
	</div>
}
