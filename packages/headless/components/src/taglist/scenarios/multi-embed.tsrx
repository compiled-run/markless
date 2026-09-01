import { state } from '@markless/core';
import { taglist } from '../../index.ts';

// One embed's worth of page, mounted twice as two separate islands by the
// multi-embed battery. Both islands run this module, so both spell identical
// instance paths, and only the host's island segment can tell their cells apart.
// One tag, so ArrowRight from its delete button runs off the end of this embed's
// close-button roster and has to land in this embed's own field. A construct may
// not be the direct child of a component tag, so the repeat opens in a plain
// element.
export default function MultiEmbed() @{
	const own = state({ tags: ['alpha'] as readonly string[] });

	<section data-testid="frame">
		<taglist.root
			data-testid="root"
			name="topics"
			value={own.tags}
			onChange={(next: readonly string[]) => {
				own.tags = next;
			}}
		>
			<taglist.label data-testid="label">Topics</taglist.label>
			<div role="presentation" data-testid="row">
				@for (const tag of own.tags; key tag) {
					<taglist.item value={tag} data-testid="item">
						<taglist.itemlabel data-testid="itemlabel" />
						<taglist.itemclose data-testid="itemclose">×</taglist.itemclose>
					</taglist.item>
				}
			</div>
			<taglist.input data-testid="input" />
			<taglist.field data-testid="field" />
		</taglist.root>
	</section>
}
