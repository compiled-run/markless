import { failSave, saveRow, type Board } from './grid-server.ts';

export function SessionBadge({ session }: { session: Board }) @{
	<nav>
		<button type="button" data-grid-fail onClick={async () => await failSave(session.subject)}>Check</button>
		@if (session.parity === 'even') {
			<b data-g="even">Even</b>
		} @else {
			<i data-g="odd">Odd</i>
		}
		<span class={session.parity} data-g="title">{session.title}</span>
		<button type="button" data-grid-save onClick={async () => await saveRow(session.subject)}>Store</button>
	</nav>
}
