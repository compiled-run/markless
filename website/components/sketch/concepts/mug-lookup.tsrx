import { computed, state } from '@markless/core';
import { lookUp } from './look-up.ts';

export default function MugLookup() @{
	let mug = state('');
	const fact = computed(async () => {
		const which = mug;
		return { text: await lookUp(which) };
	});

	<section>
		<button onClick={() => (mug = 'tall')}>Tall</button>
		<button onClick={() => (mug = 'small')}>Small</button>
		<button onClick={() => (mug = 'cracked')}>Cracked</button>
		@try {
			<p class="answer">{fact.text}</p>
		} @pending {
			<p class="wait">Looking it up...</p>
		} @catch {
			<p class="oops">Not on the shelf.</p>
		}
		<style>
			button {
				margin: 0 0.5rem 0.4rem 0;
				font-size: var(--step-0);
				padding: 0.3em 0.9em;
				color: var(--on-accent);
				background: var(--green-soft);
				border: 2px solid var(--ink);
				border-radius: 2px;
				box-shadow: 3px 3px 0 var(--ink);
				cursor: pointer;
			}

			button:active {
				transform: translate(3px, 3px);
				box-shadow: none;
			}

			p {
				margin: 0.5rem 0 0;
				font-size: var(--step-1);
			}
		</style>
	</section>
}
