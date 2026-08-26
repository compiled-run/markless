import { slider } from '../../index.ts';

// Two thumbs written out rather than repeated: a component inside a repeat
// renders nothing today, and a slider never holds a list of values anyway.
export default function Range() @{
	<slider.root value={[20, 80]} data-testid="root">
		<slider.label data-testid="label">Price</slider.label>
		<slider.valuelabel data-testid="valuelabel" />
		<slider.track
			data-testid="track"
			style="position: relative; width: 200px; height: 20px; touch-action: none"
		>
			<slider.thumb side="start" data-testid="start-thumb" />
			<slider.thumb side="end" data-testid="end-thumb" />
		</slider.track>
	</slider.root>
}
