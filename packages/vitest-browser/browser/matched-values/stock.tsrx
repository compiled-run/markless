import { computed, state } from '@markless/core';
import { answer } from './gates.ts';

export function Stock() @{
	let size = state('M');
	const inStock = computed(async () => answer(`stock:${size}`, true));
	const line = computed(() => `Size ${size} ${inStock ? 'ships today' : 'is sold out'}`);

	<article>
		<button type="button" data-large onClick={() => (size = 'L')}>L</button>
		@try {
			<p data-line>{line}</p>
		} @pending {
			<p>Checking</p>
		}
	</article>
}
