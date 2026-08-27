import { state } from '@markless/core';
import { hovercard } from '../../index.ts';

// The consumer's own handler, writing into page state the page renders, so what
// the DOM shows is what the callback was actually called with and how often.
export default function WithOnChange() @{
	const log = state({ last: '', calls: 0 });

	<section style="padding: 120px 40px">
		<button type="button" data-testid="background">Background</button>
		<hovercard.root
			data-testid="root"
			onChange={(next: boolean) => {
				log.last = String(next);
				log.calls = log.calls + 1;
			}}
		>
			<hovercard.trigger data-testid="trigger" href="/users/jane">{'@jane'}</hovercard.trigger>
			<hovercard.content data-testid="content">
				<a href="/users/jane" data-testid="card-name">Jane Doe</a>
			</hovercard.content>
		</hovercard.root>
		<p data-testid="last">{log.last}</p>
		<p data-testid="calls">{log.calls}</p>
	</section>
}
