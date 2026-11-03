import { state } from '@markless/core';
import { combobox } from '../../index.ts';

// The consumer's own handler on the field, beside the family's.
export function InputHandler() @{
	let typed = state('');

	<div>
		<combobox.root data-testid="root">
			<combobox.label data-testid="label">Favorite Fruit</combobox.label>
			<combobox.input
				data-testid="input"
				onInput={(event: Event) => {
					typed = (event.target as HTMLInputElement).value;
				}}
			/>
			<combobox.content data-testid="content">
				<combobox.item value="apple" label="Apple">
					<combobox.itemlabel>Apple</combobox.itemlabel>
				</combobox.item>
			</combobox.content>
		</combobox.root>
		<output data-testid="typed">{typed}</output>
	</div>
}
