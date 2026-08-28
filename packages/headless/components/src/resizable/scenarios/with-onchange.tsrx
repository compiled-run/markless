import { state } from '@markless/core';
import { resizable } from '../../index.ts';

// Both callbacks write into page state the page renders, so what the DOM shows
// is what the consumer's handlers were called with, and how often.
export default function WithOnChange() @{
	const log = state({ changed: 0, settled: 0, last: '', settledAt: '' });

	<section>
		<resizable.root
			defaultSizes={{ nav: 30, main: 70 }}
			data-testid="root"
			style="inline-size: 400px; block-size: 120px"
			onChange={(next: Record<string, number>) => {
				log.changed = log.changed + 1;
				log.last = String(next.nav);
			}}
			onChangeEnd={(next: Record<string, number>) => {
				log.settled = log.settled + 1;
				log.settledAt = String(next.nav);
			}}
		>
			<resizable.item value="nav" data-testid="nav">Navigation</resizable.item>
			<resizable.thumb
				value="nav"
				min={10}
				max={80}
				aria-label="Resize navigation"
				data-testid="thumb"
				style="inline-size: 8px; background: #ccc"
			/>
			<resizable.item value="main" data-testid="main">Content</resizable.item>
		</resizable.root>
		<p data-testid="changed">{log.changed}</p>
		<p data-testid="settled">{log.settled}</p>
		<p data-testid="last">{log.last}</p>
		<p data-testid="settled-at">{log.settledAt}</p>
	</section>
}
