import { element, state } from '@markless/core';

// Opening the dialog focuses its first control, a button; the field the handler
// focuses comes after it, so the handler's own call is the one that lands focus
// on the field.
export default function CommitBeforeFocusLaterFieldPage() @{
	let name = state('');
	let opens = state(0);
	const panelEl = element<HTMLDialogElement>();
	const nameEl = element<HTMLInputElement>();

	<section>
		<button
			type="button"
			data-testid="open"
			onClick={() => {
				opens += 1;
				name = `Name ${String(opens)}`;
				panelEl?.showModal();
				nameEl?.focus();
			}}
		>Open</button>
		<dialog el={panelEl} data-testid="panel">
			<button type="button" data-testid="dismiss" onClick={() => panelEl?.close()}>Dismiss</button>
			<input el={nameEl} data-testid="name" value={name} />
		</dialog>
	</section>
}
