import { computed, state } from '@markless/core';
import { loadMugFact } from './mug-facts.ts';

export default function MugFacts() @{
	let mug = state('');
	const fact = computed(async () => {
		const which = mug;
		return { text: await loadMugFact(which) };
	});

	<section>
		<button onClick={() => (mug = 'tall')}>Tall mug</button>
		<button onClick={() => (mug = 'small')}>Small mug</button>
		<button onClick={() => (mug = 'cracked')}>Cracked mug</button>
		@try {
			<p>{fact.text}</p>
		} @pending {
			<p>Looking it up...</p>
		} @catch {
			<p>That mug is not on the shelf.</p>
		}
	</section>
}
