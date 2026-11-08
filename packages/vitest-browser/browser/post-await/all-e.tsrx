import { computed, state } from '@markless/core';
import { load, note } from './loader.ts';

export function AllE() @{
	let x = state('x1');
	let y = state('y1');
	let z = state('z1');
	const both = computed(async ({ signal }) => {
		note('both');
		const zv = z;
		const [a, b] = await Promise.all([load('a:' + x, 'A', signal), load('b:' + y, 'B', signal)]);
		return a + b + ':' + zv;
	});
	<div>
		@try { <output data-o>{both}</output> } @pending { <p data-p>loading</p> } @catch { <p data-e>err</p> }
		<button data-z onClick={() => { z = 'z2'; }}>z</button>
	</div>
}
