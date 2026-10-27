import { state } from '@markless/core';

export function CallbacksPage() @{
	let total = state(0);
	let tags = state([] as string[]);
	let seen = state([] as string[]);

	<div>
		<output data-total>{total}</output>
		<output data-tags>{tags.join(',')}</output>
		<output data-seen>{seen.length}</output>
		<button data-run onClick={() => { [1, 2, 3].forEach((n) => { total += n; }); ['a', 'b'].map((x) => tags.push(x)); }}>run</button>
		<button data-spread onClick={() => { ['p', 'q'].forEach((word) => seen.push(word, word.toUpperCase())); }}>spread</button>
	</div>
}
