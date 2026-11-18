import { failSave, saveRow, type Board } from './grid-server.ts';

async function refuse(event: SubmitEvent, subject: string) {
	event.preventDefault();
	await failSave(subject);
}

export function EntryEditor({ ledger }: { ledger: Board }) @{
	<div>
		<form onSubmit={(event) => refuse(event, ledger.subject)}>
			<input name="note" value="draft" />
			<button type="submit" data-grid-fail>Check</button>
		</form>
		<h3 class={ledger.parity} data-g="title">{ledger.title}</h3>
		<ol>
			@for (const entry of ledger.items; key entry.id) {
				<li data-g="row">{entry.label}</li>
			}
		</ol>
		<form
			onSubmit={async (event) => {
				event.preventDefault();
				await saveRow(ledger.subject);
			}}
		>
			<input name="title" value="entry" />
			<button type="submit" data-grid-save>Keep</button>
		</form>
	</div>
}
