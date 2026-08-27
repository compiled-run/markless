import { state } from '@markless/core';
import { tooltip } from '../../index.ts';

// `delay={0}` so the pointer route reports on the first crossing rather than
// after a re-delivered one: the row is about the callback, not the wait.
export default function WithOnChange() @{
	const log = state({ last: '', calls: 0 });

	<section style="padding: 120px 40px">
		<button type="button" data-testid="background">Background</button>
		<tooltip.root
			data-testid="root"
			delay={0}
			onChange={(next: boolean) => {
				log.last = String(next);
				log.calls = log.calls + 1;
			}}
		>
			<tooltip.trigger data-testid="trigger">Save</tooltip.trigger>
			<tooltip.content data-testid="content">Save this draft</tooltip.content>
		</tooltip.root>
		<p data-testid="last">{log.last}</p>
		<p data-testid="calls">{log.calls}</p>
	</section>
}
