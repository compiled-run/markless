import { computed, state } from '@markless/core';
import { loadBlock } from './card.ts';

// One streamed block: its own async value and a button inside the answer.
export function Block({ name, delay }: { readonly name: string; readonly delay: number }) @{
	let marks = state(0);
	const block = computed(async () => loadBlock(name, delay));

	<article class="block">
		@try {
			<h2>{block.title}</h2>
			<p class="total">{block.total}</p>
			<button class="mark" onClick={() => marks++}>Marked {marks}</button>
		} @pending {
			<p>Loading {name}</p>
		}
	</article>
}
