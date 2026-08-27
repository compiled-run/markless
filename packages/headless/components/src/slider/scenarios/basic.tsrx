import { slider } from '../../index.ts';

// The family ships no CSS, so every scenario gives the rail its own size and
// turns off touch scrolling the way a consumer's stylesheet would.
export default function Basic() @{
	<slider.root value={40} data-testid="root">
		<slider.label data-testid="label">Volume</slider.label>
		<slider.valuelabel data-testid="valuelabel" />
		<slider.track
			data-testid="track"
			style="position: relative; width: 200px; height: 20px; touch-action: none"
		>
			<slider.thumb data-testid="thumb" />
		</slider.track>
	</slider.root>
}
