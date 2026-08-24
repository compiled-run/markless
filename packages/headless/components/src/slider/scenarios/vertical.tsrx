import * as slider from '../index.ts';

export default function Vertical() @{
	<slider.root value={40} orientation="vertical" data-testid="root">
		<slider.label data-testid="label">Height</slider.label>
		<slider.valuelabel data-testid="valuelabel" />
		<slider.track
			data-testid="track"
			style="position: relative; width: 20px; height: 200px; touch-action: none"
		>
			<slider.thumb data-testid="thumb" />
		</slider.track>
	</slider.root>
}
