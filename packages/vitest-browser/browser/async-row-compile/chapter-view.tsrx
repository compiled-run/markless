import { computed } from '@markless/core';
import { getChapter } from './gate.ts';

export function ChapterView({ chapter }: { chapter: number }) @{
	const current = computed(async () => await getChapter(chapter));

	@try {
		<section>
			<h2 data-label>{`Chapter ${chapter} of ${current.total}`}</h2>
			<ul>
				@for (const line of current.lines; key line.id) {
					<li data-line>{line.text}</li>
				}
			</ul>
		</section>
	} @pending {
		<p data-chapter-loading>Loading…</p>
	}
}
