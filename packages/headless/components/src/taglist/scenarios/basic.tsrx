import { state } from '@markless/core';
import { taglist } from '../../index.ts';

// The starter a consumer copies: a named field, two tags already committed, a
// delete button on each, and the hidden inputs that carry them into a form.
//
// The chips are the consumer's own markup over the consumer's own array. The
// array lives on a state OBJECT, not in a reassigned `let`: a repeat follows a
// property write. A construct may not be the direct child of a component tag, so
// the repeat opens in a plain element.
export default function Basic() @{
	const own = state({ tags: ['alpha', 'beta'] as readonly string[] });
	let held = state('alpha|beta');

	<main>
		<taglist.root
			data-testid="root"
			name="topics"
			value={own.tags}
			onChange={(next: readonly string[]) => {
				own.tags = next;
				held = next.join('|');
			}}
		>
			<taglist.label data-testid="label">Topics</taglist.label>
			<div role="presentation" data-testid="row">
				@for (const tag of own.tags; key tag) {
					<taglist.item value={tag} data-testid={`item-${tag}`}>
						<taglist.itemlabel data-testid={`itemlabel-${tag}`} />
						<taglist.itemclose data-testid={`itemclose-${tag}`}>×</taglist.itemclose>
					</taglist.item>
				}
			</div>
			<taglist.input data-testid="input" placeholder="Add a topic" />
			<taglist.field data-testid="field" />
		</taglist.root>
		<output data-testid="held">{held}</output>
	</main>
}
