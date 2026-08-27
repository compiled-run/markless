import { slider } from '../../index.ts';

// The direction is on the element; the family reads it there rather than taking a prop.
export default function Rtl() @{
	<slider.root value={40} dir="rtl" data-testid="root">
		<slider.label data-testid="label">مستوى الصوت</slider.label>
		<slider.valuelabel data-testid="valuelabel" />
		<slider.track
			data-testid="track"
			style="position: relative; width: 200px; height: 20px; touch-action: none"
		>
			<slider.thumb data-testid="thumb" />
		</slider.track>
	</slider.root>
}
