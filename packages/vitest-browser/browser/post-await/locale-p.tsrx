import { computed, state } from '@markless/core';
import { load, note } from './loader.ts';

export function LocaleP() @{
	let userId = state('u1');
	let locale = state('en');
	const card = computed(async ({ signal }) => {
		note('card');
		const name = await load('user:' + userId, 'Ada', signal);
		return name + '@' + locale;
	});
	<div>
		@try { <output data-o>{card}</output> } @pending { <p data-p>loading</p> } @catch { <p data-e>err</p> }
		<button data-locale onClick={() => { locale = 'fr'; }}>l</button>
		<button data-user onClick={() => { userId = 'u2'; }}>u</button>
	</div>
}
