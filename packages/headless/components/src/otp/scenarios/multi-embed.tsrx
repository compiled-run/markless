import { otp } from '../../index.ts';

// One embed's worth of page, mounted twice as two separate islands by the
// multi-embed battery. Both islands run this module, so both spell identical
// instance paths, and only the host's island segment can tell their cells apart.
// The field is one input stretched over every box, so the first box's `ui-empty`
// is what says whether the code the keystrokes wrote landed in THIS widget.
// Field first, as every shipped otp scenario writes it.
export default function MultiEmbed() @{
	<section data-testid="frame">
		<otp.root data-testid="root">
			<otp.field data-testid="field" aria-label="SMS code" />
			<otp.item data-testid="item-0" />
			<otp.item data-testid="item-1" />
			<otp.item data-testid="item-2" />
			<otp.item data-testid="item-3" />
		</otp.root>
	</section>
}
