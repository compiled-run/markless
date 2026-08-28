import { state } from '@markless/core';
// Registration is a follow-up unit, so the barrel has no `taglist` export yet.
import * as taglist from '../index.ts';

// A consumer's own component, mounted inside the root, reading the family's
// instance. This is the shape a chip row in a multi-select combobox would take.
function Summary() @{
	const list = taglist.state();

	<output data-testid="summary" ui-name={list.name} ui-count={list.value.length}>
		{list.value.join('|')}
	</output>
}

export default function ConsumerState() @{
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
			<Summary />
			<div role="presentation" data-testid="row">
				@for (const tag of own.tags; key tag) {
					<taglist.item value={tag} data-testid={`item-${tag}`}>
						<taglist.itemlabel data-testid={`itemlabel-${tag}`} />
						<taglist.itemclose data-testid={`itemclose-${tag}`}>×</taglist.itemclose>
					</taglist.item>
				}
			</div>
			<taglist.input data-testid="input" />
		</taglist.root>
		<output data-testid="held">{held}</output>
	</main>
}
