import { state } from '@markless/core';
import { slider } from '../../index.ts';

// Both callbacks write into page state the page renders, so what the DOM shows
// is what the consumer's handlers were called with, and how often.
export default function WithOnChange() @{
	const log = state({ changed: 0, settled: 0, last: '', settledAt: '' });

	<section>
		<slider.root
			value={40}
			data-testid="root"
			onChange={(next: number | [number, number]) => {
				log.changed = log.changed + 1;
				log.last = String(next);
			}}
			onChangeEnd={(next: number | [number, number]) => {
				log.settled = log.settled + 1;
				log.settledAt = String(next);
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
		<p data-testid="changed">{log.changed}</p>
		<p data-testid="settled">{log.settled}</p>
		<p data-testid="last">{log.last}</p>
		<p data-testid="settled-at">{log.settledAt}</p>
	</section>
}
