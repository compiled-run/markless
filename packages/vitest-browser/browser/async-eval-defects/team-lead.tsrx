import { computed, state } from '@markless/core';
import { getMembers, getTeam } from './gate.ts';

export default function TeamLead() @{
	let slug = state('design');
	const roster = computed(async () => {
		const team = await getTeam(slug);
		return { team, people: await getMembers(team.id) };
	});

	<article>
		@try {
			<>
				<h2 data-subject>{roster.team.name}</h2>
				<p>Everyone on the team:</p>
				@for (const person of roster.people; key person.id) {
					<div data-member>{person.name}</div>
				}
			</>
		} @pending {
			<p data-loading>Loading…</p>
		}
		<button data-switch onClick={() => (slug = 'platform')}>Platform</button>
	</article>
}
