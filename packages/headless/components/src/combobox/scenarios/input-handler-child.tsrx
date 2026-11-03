import { state } from '@markless/core';
import { combobox } from '../../index.ts';

// The same handler, in a component of its own that the root renders.
function Field() @{
	let typed = state('');

	<div>
		<combobox.input
			data-testid="input"
			onInput={(event: Event) => {
				typed = (event.target as HTMLInputElement).value;
			}}
		/>
		<output data-testid="typed">{typed}</output>
	</div>
}

export function InputHandlerInChild() @{
	<combobox.root data-testid="root">
		<combobox.label data-testid="label">Favorite Fruit</combobox.label>
		<Field />
		<combobox.content data-testid="content">
			<combobox.item value="apple" label="Apple">
				<combobox.itemlabel>Apple</combobox.itemlabel>
			</combobox.item>
		</combobox.content>
	</combobox.root>
}
