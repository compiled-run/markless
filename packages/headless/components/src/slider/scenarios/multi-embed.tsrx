import { slider } from '../../index.ts';

// One embed's worth of page, mounted twice as two separate islands by the
// multi-embed battery. The thumb starts at 20 so the rail's midpoint — where the
// battery's click lands — is bare track and reads back as 50.
export default function MultiEmbed() @{
	<section data-testid="frame">
		<slider.root value={20} data-testid="root">
			<slider.label data-testid="label">Volume</slider.label>
			<slider.valuelabel data-testid="valuelabel" />
			<slider.track
				data-testid="track"
				style="position: relative; width: 200px; height: 20px; touch-action: none"
			>
				<slider.thumb data-testid="thumb" />
			</slider.track>
		</slider.root>
	</section>
}
