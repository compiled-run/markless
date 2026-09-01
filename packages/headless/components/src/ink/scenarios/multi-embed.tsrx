import { ink } from '../../index.ts';

const SURFACE = 'display: block; width: 300px; height: 150px; color: #111';

// One embed's worth of page, mounted twice as two separate islands by the
// multi-embed battery. A press with no movement still leaves a dot, so the
// battery's click is a real stroke and the surface stops being empty.
export default function MultiEmbed() @{
	<section data-testid="frame">
		<ink.root data-testid="root" name="drawing">
			<ink.label data-testid="label">Drawing</ink.label>
			<ink.area data-testid="area" style={SURFACE} />
			<ink.field data-testid="field" />
		</ink.root>
	</section>
}
