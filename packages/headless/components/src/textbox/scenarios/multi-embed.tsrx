import { textbox } from '../../index.ts';

// One embed's worth of page, mounted twice as two separate islands by the
// multi-embed battery. Both islands run this module, so both spell identical
// instance paths, and only the host's island segment can tell their cells apart.
// The keystroke lands in the input and `ui-empty` on the root reads the result
// back from a different part of the same instance.
export default function MultiEmbed() @{
	<section data-testid="frame">
		<textbox.root name="username" data-testid="root">
			<textbox.label data-testid="label">Username</textbox.label>
			<textbox.input data-testid="input" />
		</textbox.root>
	</section>
}
