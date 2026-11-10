import { computed, state } from '@markless/core';
import { getMembers, getTeam } from './gate.ts';

export default function TeamFragment() @{
	let slug = state('design');
	const data = computed(async () => {
		const team = await getTeam(slug);
		return { team, members: await getMembers(team.id) };
	});

	<main>
		<button data-switch onClick={() => (slug = 'platform')}>Platform</button>
		@try {
			<>
				<h1 data-subject>Members of {data.team.name}</h1>
				@for (const member of data.members; key member.id) {
					<p data-member>{member.name}</p>
				}
			</>
		} @pending {
			<p data-loading>Loading…</p>
		}
	</main>
}
