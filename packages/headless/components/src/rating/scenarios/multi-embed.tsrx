import { rating } from '../../index.ts';

// One embed's worth of page, mounted twice as two separate islands by the
// multi-embed battery. Both islands run this module, so both spell identical
// instance paths. The marks are written out rather than repeated over
// `group.positions` so each one carries a testid the battery can count once per
// embed.
export default function MultiEmbed() @{
	<section data-testid="frame">
		<rating.root name="stay" data-testid="root">
			<rating.label data-testid="label">How was the stay?</rating.label>
			<div data-testid="stars">
				<rating.item value={1} data-testid="star-1"><span data-testid="glyph-1" aria-hidden="true">*</span></rating.item>
				<rating.item value={2} data-testid="star-2"><span data-testid="glyph-2" aria-hidden="true">*</span></rating.item>
				<rating.item value={3} data-testid="star-3"><span data-testid="glyph-3" aria-hidden="true">*</span></rating.item>
				<rating.item value={4} data-testid="star-4"><span data-testid="glyph-4" aria-hidden="true">*</span></rating.item>
				<rating.item value={5} data-testid="star-5"><span data-testid="glyph-5" aria-hidden="true">*</span></rating.item>
			</div>
			<rating.valuelabel data-testid="valuelabel" />
			<rating.field data-testid="field" />
		</rating.root>
	</section>
}
