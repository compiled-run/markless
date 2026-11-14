import { computed } from '@markless/core';
import { loadBlock } from './card.ts';

// One streamed block: its own async value, with no handler inside the answer.
export function Block({ name, delay }: { readonly name: string; readonly delay: number }) @{
	const block = computed(async () => loadBlock(name, delay));

	<article class="block">
		@try {
			<div class="answer">
				<h2>{block.title}</h2>
				<p class="total">{block.total}</p>
			</div>
		} @pending {
			<p>Loading {name}</p>
		}
	</article>
}
