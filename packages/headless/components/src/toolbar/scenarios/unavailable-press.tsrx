import { state } from '@markless/core';
import { toolbar } from '../../index.ts';

// An unavailable control in this family keeps its focus, so a person walking the
// bar meets it and can press it. Counting the consumer's calls is the only way
// to see that the family refused the activation rather than merely looking shut.
export default function UnavailablePress() @{
	const log = state({ last: '', calls: 0 });

	<section style="padding: 40px">
		<button type="button" data-testid="background">Background</button>
		<toolbar.root data-testid="root">
			<toolbar.label data-testid="label">Revision</toolbar.label>
			<toolbar.item
				data-testid="undo"
				onClick={() => {
					log.last = 'undo';
					log.calls = log.calls + 1;
				}}
			>Undo</toolbar.item>
			<toolbar.item
				disabled
				data-testid="redo"
				onClick={() => {
					log.last = 'redo';
					log.calls = log.calls + 1;
				}}
			>Redo</toolbar.item>
			<toolbar.item
				data-testid="compare"
				onClick={() => {
					log.last = 'compare';
					log.calls = log.calls + 1;
				}}
			>Compare</toolbar.item>
		</toolbar.root>
		<p data-testid="last">{log.last}</p>
		<p data-testid="calls">{log.calls}</p>
	</section>
}
