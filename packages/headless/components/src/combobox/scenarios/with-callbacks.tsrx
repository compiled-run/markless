import { state } from '@markless/core';
import * as combobox from '../index.ts';

// The three callbacks, each writing what it was handed. `onInput` is the one a
// consumer filters from; `onChange` reports the selection; `onOpenChange` the
// list. None of them fires on first render.
export function WithCallbacks() @{
	let chosen = state('');
	let typed = state('');
	let opens = state(0);
	let changes = state(0);

	<div>
		<combobox.root
			data-testid="root"
			onChange={(next: string | readonly string[]) => {
				chosen = typeof next === 'string' ? next : next.join(',');
				changes = changes + 1;
			}}
			onInput={(next: string) => {
				typed = next;
			}}
			onOpenChange={() => {
				opens = opens + 1;
			}}
		>
			<combobox.label data-testid="label">Favorite Fruit</combobox.label>
			<combobox.input data-testid="input" />
			<combobox.trigger data-testid="trigger">Show</combobox.trigger>
			<combobox.content data-testid="content">
				<combobox.item value="apple" label="Apple" data-testid="apple">
					<combobox.itemlabel data-testid="apple-itemlabel">Apple</combobox.itemlabel>
				</combobox.item>
				<combobox.item value="banana" label="Banana" data-testid="banana">
					<combobox.itemlabel data-testid="banana-itemlabel">Banana</combobox.itemlabel>
				</combobox.item>
			</combobox.content>
		</combobox.root>
		<output data-testid="chosen">{chosen}</output>
		<output data-testid="typed">{typed}</output>
		<output data-testid="opens">{opens}</output>
		<output data-testid="changes">{changes}</output>
	</div>
}
