import { state } from '@markless/core';
import { taglist } from '../../index.ts';

// Nobody may change this list. The field and every delete button refuse, and the
// refusal is the native `disabled` attribute rather than a handler that shrugs.
export default function Disabled() @{
	const own = state({ tags: ['locked'] as readonly string[] });
	let held = state('locked');

	<main>
		<taglist.root
			disabled
			editable
			data-testid="root"
			value={own.tags}
			onChange={(next: readonly string[]) => {
				own.tags = next;
				held = next.join('|');
			}}
		>
			<taglist.label data-testid="label">Sealed topics</taglist.label>
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
