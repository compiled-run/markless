import { computed, state } from '@markless/core';
import { load, note } from './loader.ts';

export function LocaleE() @{
	let userId = state('u1');
	let locale = state('en');
	const card = computed(async ({ signal }) => {
		note('card');
		const id = userId;
		const lang = locale;
		const name = await load('user:' + id, 'Ada', signal);
		return name + '@' + lang;
	});
	<div>
		@try { <output data-o>{card}</output> } @pending { <p data-p>loading</p> } @catch { <p data-e>err</p> }
		<button data-locale onClick={() => { locale = 'fr'; }}>l</button>
		<button data-user onClick={() => { userId = 'u2'; }}>u</button>
	</div>
}
