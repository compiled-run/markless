import { state } from '@markless/core';
// Registration is a follow-up unit, so the barrel has no `editable` export yet.
import * as editable from '../index.ts';

// Landing on the preview opens the session, Tab included. Ark's default; kept as
// an opt-in here because a Tab that silently swaps a control for a text field is
// a surprise a person did not ask for.
export default function OnFocus() @{
	const own = state({ title: 'inbox' });
	let held = state('inbox');

	<main>
		<button type="button" data-testid="before">Before</button>
		<editable.root
			editOnFocus
			data-testid="root"
			value={own.title}
			onChange={(next: string) => {
				own.title = next;
				held = next;
			}}
		>
			<editable.label data-testid="label">List name</editable.label>
			<editable.trigger data-testid="trigger" />
			<editable.input data-testid="input" />
		</editable.root>
		<output data-testid="held">{held}</output>
	</main>
}
