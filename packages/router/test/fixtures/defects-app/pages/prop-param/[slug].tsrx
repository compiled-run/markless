import { computed, state } from '@markless/core';
import type { PageProps } from '@markless/router';
import { answerSoon } from '../../src/answer-soon.ts';

export default function PropParam({ params }: PageProps<{ slug: string }>) @{
	let picks = state(0);
	let label = state(`${params.slug}!`);
	const tags = computed(async () => {
		const n = picks;
		return answerSoon(n > 0 ? [`red ${label}`, 'blue'] : ['red']);
	});
	<section>
		<button type="button" data-bump onClick={() => picks++}>pick</button>
		@try {
			<ol>
				@for (const tag of tags; key tag) {
					<li data-tag title={params.slug === 'plum' ? 'ripe' : 'raw'}>{tag}</li>
				}
			</ol>
		} @pending {
			<p>pending</p>
		} @catch (error) {
			<p>{'caught ' + String(error)}</p>
		}
	</section>
}
