import { state } from '@markless/core';
import { buttongroup } from '../../index.ts';

// A real form: an item's hidden field carries it into the FormData, and the
// output writes what the browser itself submitted. A multi-select group submits
// its name once per pressed item, which is what `getAll` reads back.
export default function Form() @{
	let submitted = state('');

	<form
		data-testid="form"
		onSubmit={(event) => {
			event.preventDefault();
			const data = new FormData(event.target as HTMLFormElement);
			submitted = `${data.getAll('style').join(',')}|${data.getAll('align').join(',')}`;
		}}
	>
		<buttongroup.root multiple name="style" value={['bold']} data-testid="root">
			<buttongroup.label data-testid="label">Text style</buttongroup.label>
			<buttongroup.item value="bold" data-testid="bold">
				Bold
				<buttongroup.itemfield data-testid="bold-field" />
			</buttongroup.item>
			<buttongroup.item value="italic" data-testid="italic">
				Italic
				<buttongroup.itemfield data-testid="italic-field" />
			</buttongroup.item>
		</buttongroup.root>
		<buttongroup.root name="align" value="left" data-testid="align-root">
			<buttongroup.label data-testid="align-label">Text alignment</buttongroup.label>
			<buttongroup.item value="left" data-testid="left">
				Left
				<buttongroup.itemfield data-testid="left-field" />
			</buttongroup.item>
			<buttongroup.item value="right" data-testid="right">
				Right
				<buttongroup.itemfield data-testid="right-field" />
			</buttongroup.item>
		</buttongroup.root>
		<button type="submit" data-testid="submit">Save</button>
		<output data-testid="submitted">{submitted}</output>
	</form>
}
