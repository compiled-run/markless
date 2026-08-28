import { state } from '@markless/core';
// Registration is a follow-up unit, so the barrel has no `taglist` export yet.
// This is the same namespace object `import { taglist } from '../../index.ts'`
// will hand back once it does.
import * as taglist from '../index.ts';

// The other shape the one family covers: a filter-chip row with no field at all.
// Nothing here can add a tag; the delete buttons are still ordinary tab stops and
// still carry the whole arrow-walk protocol.
export default function DisplayOnly() @{
	const own = state({ tags: ['red', 'green', 'blue'] as readonly string[] });
	let held = state('red|green|blue');

	<main>
		<taglist.root
			data-testid="root"
			value={own.tags}
			onChange={(next: readonly string[]) => {
				own.tags = next;
				held = next.join('|');
			}}
		>
			<taglist.label data-testid="label">Active filters</taglist.label>
			<div role="presentation" data-testid="row">
				@for (const tag of own.tags; key tag) {
					<taglist.item value={tag} data-testid={`item-${tag}`}>
						<taglist.itemlabel data-testid={`itemlabel-${tag}`} />
						<taglist.itemclose data-testid={`itemclose-${tag}`}>×</taglist.itemclose>
					</taglist.item>
				}
			</div>
		</taglist.root>
		<output data-testid="held">{held}</output>
	</main>
}
