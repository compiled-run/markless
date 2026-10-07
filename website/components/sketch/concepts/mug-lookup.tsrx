import { computed } from '@markless/core';
import { lookUp } from './look-up.ts';

export default function MugLookup({ mug }: { readonly mug: string }) @{
	const fact = computed(async () => {
		const which = mug;
		return { text: await lookUp(which) };
	});

	<section class="mugs">
		<div class="out">
			@try {
				<p class="answer">{fact.text}</p>
			} @pending {
				<p class="wait">Looking it up...</p>
			} @catch {
				<p class="oops">Not on the shelf.</p>
			}
		</div>
		<style>
			.out {
				min-height: 3lh;
			}

			.answer,
			.wait,
			.oops {
				margin: 0;
				color: var(--ink);
				font-size: var(--step-0);
			}

			.oops {
				display: inline-block;
				padding: 0.1em 0.45em;
				border-radius: 4px;
				background: color-mix(in srgb, var(--pink) 14%, var(--paper));
			}
		</style>
	</section>
}
