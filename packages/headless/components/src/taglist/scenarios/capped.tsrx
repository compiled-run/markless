import { state } from '@markless/core';
// Registration is a follow-up unit, so the barrel has no `taglist` export yet.
// This is the same namespace object `import { taglist } from '../../index.ts'`
// will hand back once it does.
import * as taglist from '../index.ts';

// A cap, a delimiter that is not a comma, and a description that says both out
// loud. `max` refuses the fourth tag and the root's live region says why.
export default function Capped() @{
	const own = state({ tags: ['one'] as readonly string[] });
	let held = state('one');

	<main>
		<taglist.root
			max={3}
			delimiter=";"
			data-testid="root"
			value={own.tags}
			onChange={(next: readonly string[]) => {
				own.tags = next;
				held = next.join('|');
			}}
		>
			<taglist.label data-testid="label">Keywords</taglist.label>
			<taglist.description data-testid="description">
				Up to three, separated by semicolons.
			</taglist.description>
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
