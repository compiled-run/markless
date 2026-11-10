import { computed, state } from '@markless/core';
import { getMembers, getTeam } from './gate.ts';

export default function TeamTrailing() @{
	let slug = state('design');
	const roster = computed(async () => {
		const team = await getTeam(slug);
		return { team, people: await getMembers(team.id) };
	});

	<div>
		<nav>
			<button data-switch onClick={() => (slug = 'platform')}>Platform</button>
		</nav>
		<aside>side</aside>
		@try {
			<>
				@for (const person of roster.people; key person.id) {
					<li data-member>{person.name}</li>
				}
				<footer data-subject>{roster.team.name} team</footer>
			</>
		} @pending {
			<span data-loading>Loading…</span>
		}
	</div>
}
