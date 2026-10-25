import { computed, state } from '@markless/core';

export function App() @{
	let version = state(0);
	const team = computed(async () => {
		const at = version;
		await new Promise((resolve) => setTimeout(resolve, 10));
		return { name: 'Team ' + at };
	});
	const members = computed(async () => {
		const at = version;
		await new Promise((resolve) => setTimeout(resolve, 30));
		return { label: 'Members ' + at };
	});

	<main>
		<button type="button" data-refresh onClick={() => version = version + 1}>Refresh</button>
		@try {
			<div data-outer>
				<h2>{team.name}</h2>
				@try {
					<p data-inner>{members.label}</p>
				} @pending {
					<p data-inner-wait>Loading members</p>
				} @catch {
					<p data-inner-failed>Members failed</p>
				}
			</div>
		} @pending {
			<p data-outer-wait>Loading team</p>
		} @catch {
			<p data-outer-failed>Team failed</p>
		}
	</main>
}
