import { state } from '@markless/core';
import { calendar } from '../../index.ts';
import type { CalendarValue } from '../calendar-types.ts';

// A span of days. The page renders the anchor while one is live, so a test can
// see that the first press reports nothing and the second reports both ends.
export default function Range() @{
	const log = state({ start: '', end: '', calls: 0 });

	<section>
		<calendar.root
			range
			month="2026-08-01"
			data-testid="root"
			onChange={(next: CalendarValue) => {
				const span = next as { start: string; end: string } | null;
				log.start = span === null ? '' : span.start;
				log.end = span === null ? '' : span.end;
				log.calls = log.calls + 1;
			}}
		>
			<Month />
		</calendar.root>
		<p data-testid="start">{log.start}</p>
		<p data-testid="end">{log.end}</p>
		<p data-testid="calls">{log.calls}</p>
	</section>
}

function Month() @{
	const cal = calendar.state();

	<calendar.content data-testid="content">
		<calendar.backtrigger data-testid="back">Back</calendar.backtrigger>
		<calendar.title data-testid="title" />
		<calendar.forwardtrigger data-testid="forward">Forward</calendar.forwardtrigger>
		<div data-testid="weekdays" aria-hidden="true">
			@for (const name of cal.weekdays; key name) {
				<span data-testid="weekday">{name}</span>
			}
		</div>
		<div data-testid="days">
			@for (const day of cal.days; key day) {
				<calendar.item value={day} data-testid="day" />
			}
		</div>
		<p data-testid="anchor">{cal.anchor ?? ''}</p>
	</calendar.content>
}
