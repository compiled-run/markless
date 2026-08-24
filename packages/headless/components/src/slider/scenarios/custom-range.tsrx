import * as slider from '../index.ts';

// Steps are counted from `min`, so this one reaches 5, 15, 25 and never 10.
export default function CustomRange() @{
	<slider.root value={25} min={5} max={105} step={10} data-testid="root">
		<slider.label data-testid="label">Temperature</slider.label>
		<slider.valuelabel data-testid="valuelabel" />
		<slider.track
			data-testid="track"
			style="position: relative; width: 200px; height: 20px; touch-action: none"
		>
			<slider.thumb data-testid="thumb" />
		</slider.track>
	</slider.root>
}
