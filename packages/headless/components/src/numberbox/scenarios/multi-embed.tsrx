import { numberbox } from '../../index.ts';

// One embed's worth of page, mounted twice as two separate islands by the
// multi-embed battery. Both islands run this module, so both spell identical
// instance paths, and only the host's island segment can tell their cells apart.
// The step button is the one gesture a pointer can make here, and `valuelabel`
// reads the stepped value back out of the same instance from a different part.
export default function MultiEmbed() @{
	<section data-testid="frame">
		<numberbox.root value={12} name="quantity" data-testid="root">
			<numberbox.label data-testid="label">Quantity</numberbox.label>
			<numberbox.input data-testid="input" />
			<numberbox.valuelabel data-testid="valuelabel" />
			<numberbox.backtrigger data-testid="backtrigger">-</numberbox.backtrigger>
			<numberbox.forwardtrigger data-testid="forwardtrigger">+</numberbox.forwardtrigger>
		</numberbox.root>
	</section>
}
