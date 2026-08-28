import { state } from '@markless/core';
// Registration is a follow-up unit, so the barrel has no `editable` export yet.
// This is the same namespace object `import { editable } from '../../index.ts'`
// will hand back once it does.
import * as editable from '../index.ts';

// The starter a consumer copies: a named value, a preview control that opens the
// session, the field it is edited in, and the hidden input that carries it into a
// form. A single click opens the session, which is what a button already means.
//
// The value lives on a state OBJECT, not in a reassigned `let`: a property write
// is what the graph follows.
export default function Basic() @{
	const own = state({ title: 'Quarterly plan' });
	let held = state('Quarterly plan');
	let sessions = state('');

	<main>
		<editable.root
			data-testid="root"
			name="title"
			value={own.title}
			onChange={(next: string) => {
				own.title = next;
				held = next;
			}}
			onEditChange={(editing: boolean) => {
				sessions = `${sessions}${editing ? 'open ' : 'shut '}`;
			}}
		>
			<editable.label data-testid="label">Document name</editable.label>
			<editable.trigger data-testid="trigger" />
			<editable.input data-testid="input" />
			<editable.field data-testid="field" />
		</editable.root>
		<output data-testid="held">{held}</output>
		<output data-testid="sessions">{sessions}</output>
	</main>
}
