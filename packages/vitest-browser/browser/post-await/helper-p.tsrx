import { computed, state } from '@markless/core';
import { load, note } from './loader.ts';

export function HelperP() @{
	let prefix = state('Dr');
	let count = state(1);
	function label(name: string) {
		return prefix + ' ' + name;
	}
	async function tally(signal: AbortSignal) {
		const n = await load('tally', 10, signal);
		return n + count;
	}
	const card = computed(async ({ signal }) => {
		note('card');
		const name = await load('user', 'Ada', signal);
		return label(name) + '/' + (await tally(signal));
	});
	<div>
		@try { <output data-o>{card}</output> } @pending { <p data-p>loading</p> } @catch { <p data-e>err</p> }
		<button data-prefix onClick={() => { prefix = 'Prof'; }}>p</button>
		<button data-count onClick={() => { count = 5; }}>c</button>
	</div>
}
