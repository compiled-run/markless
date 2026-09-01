import { state } from '@markless/core';
import { buttongroup } from '../../index.ts';

// A pressed item nobody may press, and a pressed item inside a group nobody may
// touch. A disabled control is left out of the form data set, so neither reaches
// the server while the item beside them does.
export default function DisabledForm() @{
	let submitted = state('');

	<form
		data-testid="form"
		onSubmit={(event) => {
			event.preventDefault();
			const data = new FormData(event.target as HTMLFormElement);
			submitted = `${data.getAll('style').join(',')}|${data.getAll('align').join(',')}`;
		}}
	>
		<buttongroup.root multiple name="style" value={['bold', 'italic']} data-testid="root">
			<buttongroup.label data-testid="label">Text style</buttongroup.label>
			<buttongroup.item value="bold" data-testid="bold">
				Bold
				<buttongroup.itemfield data-testid="bold-field" />
			</buttongroup.item>
			<buttongroup.item value="italic" disabled data-testid="italic">
				Italic
				<buttongroup.itemfield data-testid="italic-field" />
			</buttongroup.item>
		</buttongroup.root>
		<buttongroup.root disabled name="align" value="left" data-testid="locked-root">
			<buttongroup.label data-testid="locked-label">Text alignment</buttongroup.label>
			<buttongroup.item value="left" data-testid="left">
				Left
				<buttongroup.itemfield data-testid="left-field" />
			</buttongroup.item>
		</buttongroup.root>
		<button type="submit" data-testid="submit">Save</button>
		<output data-testid="submitted">{submitted}</output>
	</form>
}
