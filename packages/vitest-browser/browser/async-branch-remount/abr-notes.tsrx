import { computed, state } from '@markless/core';

async function summarize(topic: string) {
	await new Promise((resolve) => setTimeout(resolve, 3));
	if (topic === 'broken') throw new Error('no summary');
	return `${topic} summary`;
}

export default function NotesDrawer() @{
	let collapsed = state(true);
	let topic = state('alpha');
	const summary = computed(async () => await summarize(topic));
	<article>
		<span role="button" data-toggle onClick={() => collapsed = !collapsed}>Notes</span>
		<span role="button" data-next onClick={() => topic = topic === 'alpha' ? 'beta' : topic === 'beta' ? 'broken' : 'alpha'}>Next</span>
		@if (!collapsed) {
			<aside data-drawer>
				<h2>Notes</h2>
				@try {
					<p data-summary>{summary}</p>
				} @catch {
					<p data-trouble>No summary</p>
				}
			</aside>
		} @else {
			<em data-folded>Folded</em>
		}
	</article>
}
