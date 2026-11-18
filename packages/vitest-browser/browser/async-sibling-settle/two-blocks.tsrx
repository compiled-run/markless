import { computed } from '@markless/core';
import { load } from './gate.ts';

export default function TwoBlocks() @{
	const left = computed(async () => await load('left', 'right', { text: 'Left ready' }));
	const right = computed(async () => await load('right', 'left', { text: 'Right ready' }));

	<main data-page="two-blocks">
		@try {
			<p data-left>{left.text}</p>
		} @pending {
			<p data-left-pending>Loading left</p>
		} @catch {
			<p data-left-failed>Left failed</p>
		}
		@try {
			<p data-right>{right.text}</p>
		} @pending {
			<p data-right-pending>Loading right</p>
		} @catch {
			<p data-right-failed>Right failed</p>
		}
	</main>
}
