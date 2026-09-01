import { state } from '@markless/core';
import { taglist } from '../../index.ts';

// A disabled row inside a real form. A disabled control is barred from submission
// by the platform, so the hidden inputs the field part renders have to carry the
// flag too.
export default function DisabledForm() @{
	const own = state({ tags: ['news', 'sport'] as readonly string[] });
	let submitted = state('unsubmitted');

	<form
		data-testid="form"
		onSubmit={(event) => {
			event.preventDefault();
			submitted = new FormData(event.target as HTMLFormElement).getAll('topics').join('|');
		}}
	>
		<taglist.root disabled name="topics" data-testid="root" value={own.tags}>
			<taglist.label data-testid="label">Topics</taglist.label>
			<div role="presentation" data-testid="row">
				@for (const tag of own.tags; key tag) {
					<taglist.item value={tag} data-testid={`item-${tag}`}>
						<taglist.itemlabel data-testid={`itemlabel-${tag}`} />
						<taglist.itemclose data-testid={`itemclose-${tag}`}>×</taglist.itemclose>
					</taglist.item>
				}
			</div>
			<taglist.input data-testid="input" />
			<taglist.field data-testid="field" />
		</taglist.root>
		<button type="submit" data-testid="submit">Save</button>
		<output data-testid="submitted">{submitted}</output>
	</form>
}
