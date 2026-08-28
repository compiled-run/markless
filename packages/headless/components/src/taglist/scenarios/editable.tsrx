import { state } from '@markless/core';
// Registration is a follow-up unit, so the barrel has no `taglist` export yet.
// This is the same namespace object `import { taglist } from '../../index.ts'`
// will hand back once it does.
import * as taglist from '../index.ts';

// Per-tag inline edit, opt in. Enter on a highlighted tag or a double-click on
// the tag itself opens its own field; Enter takes the words, Escape gives the tag
// back unchanged.
export default function Editable() @{
	const own = state({ tags: ['draft', 'review'] as readonly string[] });
	let held = state('draft|review');

	<main>
		<taglist.root
			editable
			data-testid="root"
			value={own.tags}
			onChange={(next: readonly string[]) => {
				own.tags = next;
				held = next.join('|');
			}}
		>
			<taglist.label data-testid="label">Stages</taglist.label>
			<div role="presentation" data-testid="row">
				@for (const tag of own.tags; key tag) {
					<taglist.item value={tag} data-testid={`item-${tag}`}>
						<taglist.itemlabel data-testid={`itemlabel-${tag}`} />
						<taglist.iteminput data-testid={`iteminput-${tag}`} />
						<taglist.itemclose data-testid={`itemclose-${tag}`}>×</taglist.itemclose>
					</taglist.item>
				}
			</div>
			<taglist.input data-testid="input" />
		</taglist.root>
		<output data-testid="held">{held}</output>
	</main>
}
