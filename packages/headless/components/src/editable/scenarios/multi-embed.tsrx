import { editable } from '../../index.ts';

// One embed's worth of page, mounted twice as two separate islands by the
// multi-embed battery. Both islands run this module, so both spell identical
// instance paths, and only the host's island segment can tell their cells apart.
// A single click on the preview opens the session, and `ui-editing` on the box
// reads that back out of the same instance from a different part.
export default function MultiEmbed() @{
	<section data-testid="frame">
		<editable.root value="Quarterly plan" name="title" data-testid="root">
			<editable.label data-testid="label">Document name</editable.label>
			<editable.trigger data-testid="trigger" />
			<editable.input data-testid="input" />
			<editable.field data-testid="field" />
		</editable.root>
	</section>
}
