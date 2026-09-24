import { computed, state } from '@markless/core';

export default function Roster() @{
	let picked = state('nobody');
	const crew = computed(async () => {
		await new Promise((resolve) => setTimeout(resolve, 5));
		return [{ id: 'r1' }, { id: 'r2' }, { id: 'r3' }];
	});

	<main>
		@try {
			<ul class="roster">
				@for (const member of crew; key member.id) {
					<li><button class="pick" data-row={member.id} onClick={() => (picked = member.id)}>{member.id}</button></li>
				}
			</ul>
		} @pending {
			<p class="pending">Loading</p>
		} @catch {
			<p class="broken">Broken</p>
		}
		<output data-picked>{picked}</output>
	</main>
}
