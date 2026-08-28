import { state } from '@markless/core';
import { taglist } from '../../index.ts';

// A real form: one hidden input per tag under one name, so the browser hands the
// submit handler every tag back. A description and an error ride along, and the
// error is named ahead of the hint.
export default function TopicsForm() @{
	const own = state({ tags: ['news'] as readonly string[] });
	let held = state('news');
	let submitted = state('');

	<form
		data-testid="form"
		onSubmit={(event) => {
			event.preventDefault();
			submitted = new FormData(event.target as HTMLFormElement).getAll('topics').join('|');
		}}
	>
		<taglist.root
			required
			invalid
			name="topics"
			data-testid="root"
			value={own.tags}
			onChange={(next: readonly string[]) => {
				own.tags = next;
				held = next.join('|');
			}}
		>
			<taglist.label data-testid="label">Topics</taglist.label>
			<taglist.error data-testid="error">Add at least two topics.</taglist.error>
			<taglist.description data-testid="description">Press comma to add one.</taglist.description>
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
		<output data-testid="held">{held}</output>
		<output data-testid="submitted">{submitted}</output>
	</form>
}
