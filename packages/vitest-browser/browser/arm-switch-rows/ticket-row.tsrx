export type Ticket = { id: string; title: string; resolved: boolean };

export default function TicketRow({ ticket, onOpen }: { ticket: Ticket; onOpen: (picked: Ticket) => void }) @{
	<tr data-row={ticket.id} onClick={() => onOpen(ticket)}>
		<td>{ticket.title}</td>
	</tr>
}
