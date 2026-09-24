import { computed, state } from '@markless/core';

// One level of rows with handlers inside a settled @try arm, for comparison with the nested lists.
export default function FlatTry() @{
	let voted = state('nobody');
	const board = computed(async () => {
		await new Promise((resolve) => setTimeout(resolve, 5));
		return [{ id: 'm1' }, { id: 'm2' }, { id: 'm3' }];
	});

	<main>
		@try {
			<div class="try-arm">
				@for (const member of board; key member.id) {
					<button class="pick" data-member={member.id} onClick={() => (voted = member.id)}>{member.id}</button>
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
