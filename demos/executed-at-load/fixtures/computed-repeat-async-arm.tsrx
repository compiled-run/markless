import { computed } from '@markless/core';

export function ComputedRepeatAsyncArm() @{
	const feed = computed(async () => ({
		channel: 'local',
		rows: [{ id: 'one', label: 'One' }],
	}));
	const summary = computed(() => `Channel ${feed.channel}`);

	<main>
		@try {
			<section>
				<p>{summary}</p>
				<ul>
					@for (const row of feed.rows; key row.id) {
						<li>{row.label}</li>
					}
				</ul>
			</section>
		} @pending {
			<p>Loading</p>
		} @catch {
			<p>Failed</p>
		}
	</main>
}
