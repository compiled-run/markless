import * as combobox from '../index.ts';

// `invalid` is a root prop here, and the error part carries the message. Qwik UI
// derives invalidity from the error component's mere presence; that is a
// render-phase write to an already-rendered part, which is defect 31 - see
// note.md.
export function WithError() @{
	<combobox.root invalid data-testid="root">
		<combobox.label data-testid="label">Favorite Fruit</combobox.label>
		<combobox.input data-testid="input" />
		<combobox.error data-testid="error">Pick a fruit that exists.</combobox.error>
		<combobox.trigger data-testid="trigger">Show</combobox.trigger>
		<combobox.content data-testid="content">
			<combobox.item value="apple" label="Apple" data-testid="apple">
				<combobox.itemlabel data-testid="apple-itemlabel">Apple</combobox.itemlabel>
			</combobox.item>
		</combobox.content>
	</combobox.root>
}
