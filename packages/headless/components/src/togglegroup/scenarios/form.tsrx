import { state } from '@markless/core';
import { togglegroup } from '../../index.ts';

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
		<togglegroup.root multiple name="style" value={['bold']} data-testid="root">
			<togglegroup.label data-testid="label">Text style</togglegroup.label>
			<togglegroup.item value="bold" data-testid="bold">
				Bold
				<togglegroup.itemfield data-testid="bold-field" />
			</togglegroup.item>
			<togglegroup.item value="italic" data-testid="italic">
				Italic
				<togglegroup.itemfield data-testid="italic-field" />
			</togglegroup.item>
		</togglegroup.root>
		<togglegroup.root name="align" value="left" data-testid="align-root">
			<togglegroup.label data-testid="align-label">Text alignment</togglegroup.label>
			<togglegroup.item value="left" data-testid="left">
				Left
				<togglegroup.itemfield data-testid="left-field" />
			</togglegroup.item>
			<togglegroup.item value="right" data-testid="right">
				Right
				<togglegroup.itemfield data-testid="right-field" />
			</togglegroup.item>
		</togglegroup.root>
		<button type="submit" data-testid="submit">Save</button>
		<output data-testid="submitted">{submitted}</output>
	</form>
}
