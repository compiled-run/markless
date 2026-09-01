import { tokenbox } from '../../index.ts';

// One embed's worth of page, mounted twice as two separate islands by the
// multi-embed battery. Both islands run this module, so both spell identical
// instance paths, and only the host's island segment can tell their cells apart.
// The insertion button is the family's own published route to `insertToken`, and
// `ui-empty` on the root reads the resulting segments back from another part.
export default function MultiEmbed() @{
	<section data-testid="frame">
		<tokenbox.root data-testid="root" name="prompt">
			<tokenbox.label data-testid="label">Message</tokenbox.label>
			<tokenbox.input data-testid="input" />
			<tokenbox.itemtrigger value="u_1" label="Alice Chen" data-testid="suggest" />
			<tokenbox.field data-testid="field" />
		</tokenbox.root>
	</section>
}
