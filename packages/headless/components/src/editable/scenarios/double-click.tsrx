import { state } from '@markless/core';
// Registration is a follow-up unit, so the barrel has no `editable` export yet.
import * as editable from '../index.ts';

// Two clicks open the session; one does nothing. Enter and Space on the preview
// still open it, because a gesture only a mouse can make is not a keyboard-
// operable control.
export default function DoubleClick() @{
	const own = state({ title: 'notes.md' });
	let held = state('notes.md');

	<main>
		<editable.root
			editOnDoubleClick
			data-testid="root"
			value={own.title}
			onChange={(next: string) => {
				own.title = next;
				held = next;
			}}
		>
			<editable.label data-testid="label">File name</editable.label>
			<editable.trigger data-testid="trigger" />
			<editable.input data-testid="input" />
		</editable.root>
		<output data-testid="held">{held}</output>
	</main>
}
