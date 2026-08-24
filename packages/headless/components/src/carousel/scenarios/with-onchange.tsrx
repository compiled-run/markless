import { state } from '@markless/core';
import * as carousel from '../index.ts';

// A consumer watching the showing slide. The log is written straight into the
// page so a test reads what the handler saw, not what it hoped.
export default function WithOnChange() @{
	const log = state({ last: '', calls: 0 });

	<section>
		<carousel.root
			value="paris"
			onChange={(value) => {
				log.last = value;
				log.calls = log.calls + 1;
			}}
			data-testid="root"
		>
			<carousel.scrollarea data-testid="scrollarea" data-viewport>
				<carousel.item value="paris" data-testid="paris-item" data-slide>Paris</carousel.item>
				<carousel.item value="oslo" data-testid="oslo-item" data-slide>Oslo</carousel.item>
			</carousel.scrollarea>
			<carousel.forwardtrigger data-testid="forwardtrigger">Next</carousel.forwardtrigger>
		</carousel.root>
		<p data-testid="last">{log.last}</p>
		<p data-testid="calls">{log.calls}</p>
	</section>
}
