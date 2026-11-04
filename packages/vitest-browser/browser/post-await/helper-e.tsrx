import { computed, state } from '@markless/core';
import { load, note } from './loader.ts';

export function HelperE() @{
	let prefix = state('Dr');
	let count = state(1);
	function label(title: string, name: string) {
		return title + ' ' + name;
	}
	async function tally(extra: number, signal: AbortSignal) {
		const n = await load('tally', 10, signal);
		return n + extra;
	}
	const card = computed(async ({ signal }) => {
		note('card');
		const title = prefix;
		const extra = count;
		const name = await load('user', 'Ada', signal);
		return label(title, name) + '/' + (await tally(extra, signal));
	});
	<div>
		@try { <output data-o>{card}</output> } @pending { <p data-p>loading</p> } @catch { <p data-e>err</p> }
		<button data-prefix onClick={() => { prefix = 'Prof'; }}>p</button>
		<button data-count onClick={() => { count = 5; }}>c</button>
	</div>
}
