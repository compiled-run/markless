import { computed, element, state } from '@markless/core';

// The handler writes the cell bound onto the field's `value`, opens the dialog
// and focuses the field. The field is the dialog's first focusable control, so
// opening the dialog focuses it before the handler's own call does.
export default function CommitBeforeFocusDialogFieldPage() @{
	let draft = state('');
	let opens = state(0);
	const dialogEl = element<HTMLDialogElement>();
	const fieldEl = element<HTMLInputElement>();
	const blank = computed(() => draft.trim() === '');

	<section>
		<button
			type="button"
			data-testid="edit"
			onClick={() => {
				opens += 1;
				draft = `Record ${String(opens)}`;
				dialogEl?.showModal();
				fieldEl?.focus();
			}}
		>Edit</button>
		<dialog el={dialogEl} data-testid="dialog">
			<input el={fieldEl} data-testid="field" value={draft} onInput={() => (draft = fieldEl?.value ?? '')} />
			<button type="button" data-testid="save" disabled={blank}>Save</button>
			<button type="button" data-testid="close" onClick={() => dialogEl?.close()}>Close</button>
		</dialog>
	</section>
}
