import { computed, state } from '@markless/core';
import TicketRow, { type Ticket } from './ticket-row.tsrx';

export default function QueuePage() @{
	const queue = computed(async (): Promise<Ticket[]> => [
		{ id: 't1', title: 'Brakes', resolved: false },
		{ id: 't2', title: 'Tyres', resolved: true },
		{ id: 't3', title: 'Lights', resolved: false },
	]);
	const active = computed(() => queue.filter((ticket) => !ticket.resolved));
	const resolved = computed(() => queue.filter((ticket) => ticket.resolved));
	let tab = state('active');
	let picked = state('none');

	<div>
		<button type="button" data-tab="active" onClick={() => (tab = 'active')}>
			Active
		</button>
		<button type="button" data-tab="resolved" onClick={() => (tab = 'resolved')}>
			Resolved
		</button>
		<p data-picked>{picked}</p>
		@try {
			<table>
				@switch (tab) {
					@case 'active': {
						<tbody data-panel="active">
							@for (const ticket of active; key ticket.id) {
								<TicketRow ticket={ticket} onOpen={(open) => (picked = open.title)} />
							} @empty {
								<tr>
									<td>No open tickets</td>
								</tr>
							}
						</tbody>
					}
					@default: {
						<tbody data-panel="resolved">
							@for (const ticket of resolved; key ticket.id) {
								<TicketRow ticket={ticket} onOpen={(open) => (picked = open.title)} />
							} @empty {
								<tr>
									<td>Nothing resolved</td>
								</tr>
							}
						</tbody>
					}
				}
			</table>
		} @pending {
			<p>Loading</p>
		}
	</div>
}
