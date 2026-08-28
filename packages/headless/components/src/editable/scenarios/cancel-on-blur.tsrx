import { state } from '@markless/core';
// Registration is a follow-up unit, so the barrel has no `editable` export yet.
import * as editable from '../index.ts';

// Moving focus out gives the previous value back instead of taking the words.
// The other half of the blur policy; the default is the opposite.
export default function CancelOnBlur() @{
	const own = state({ title: 'draft' });
	let held = state('draft');

	<main>
		<editable.root
			cancelOnBlur
			data-testid="root"
			value={own.title}
			onChange={(next: string) => {
				own.title = next;
				held = next;
			}}
		>
			<editable.label data-testid="label">Stage</editable.label>
			<editable.trigger data-testid="trigger" />
			<editable.input data-testid="input" />
		</editable.root>
		<button type="button" data-testid="elsewhere">Elsewhere</button>
		<output data-testid="held">{held}</output>
	</main>
}
