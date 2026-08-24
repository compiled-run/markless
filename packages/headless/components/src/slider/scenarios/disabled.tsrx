import { state } from '@markless/core';
import * as slider from '../index.ts';

export default function Disabled() @{
	const log = state({ calls: 0 });

	<section>
		<slider.root
			value={40}
			disabled
			data-testid="root"
			onChange={() => {
				log.calls = log.calls + 1;
			}}
		>
			<slider.label data-testid="label">Volume</slider.label>
			<slider.valuelabel data-testid="valuelabel" />
			<slider.track
				data-testid="track"
				style="position: relative; width: 200px; height: 20px; touch-action: none"
			>
				<slider.thumb data-testid="thumb" />
			</slider.track>
		</slider.root>
		<p data-testid="calls">{log.calls}</p>
	</section>
}
