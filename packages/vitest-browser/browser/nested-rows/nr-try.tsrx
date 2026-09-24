import { computed, state } from '@markless/core';

// Nested lists inside a settled @try arm: the arm registers the inner rows of every row it served.
export default function TryArm() @{
	let voted = state('nobody');
	const board = computed(async () => {
		await new Promise((resolve) => setTimeout(resolve, 5));
		return [
			{ id: 't1', cards: [{ id: 'm1', votes: 0 }, { id: 'm2', votes: 0 }] },
			{ id: 't2', cards: [{ id: 'm3', votes: 0 }] },
		];
	});

	<main>
		@try {
			<div class="try-arm">
				@for (const team of board; key team.id) {
					<div class="team" data-team={team.id}>
						@for (const member of team.cards; key member.id) {
							<button class="pick" data-member={member.id} onClick={() => (voted = member.id)}>{member.id}</button>
						}
					</div>
				}
			</div>
		} @pending {
			<p class="pending">Loading</p>
		} @catch {
			<p class="broken">Broken</p>
		}
		<output data-voted>{voted}</output>
	</main>
}
