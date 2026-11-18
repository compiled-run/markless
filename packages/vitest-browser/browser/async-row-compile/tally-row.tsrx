import { computed } from '@markless/core';
import { getChapter } from './gate.ts';

export function TallyRow({ chapter, onNext }: { chapter: number; onNext: () => void }) @{
	const current = computed(async () => await getChapter(chapter));

	<article data-row>
		@try {
			<div>
				<span data-row-value>{chapter} of {current.total}</span>
				<button data-row-next onClick={onNext}>next from row</button>
			</div>
		} @pending {
			<p data-row-loading>Loading…</p>
		}
	</article>
}
