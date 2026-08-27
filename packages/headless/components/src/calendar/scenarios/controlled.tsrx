import { state } from '@markless/core';
import { calendar } from '../../index.ts';
import type { CalendarValue } from '../calendar-types.ts';

// The consumer holds the date and feeds it back in, and renders what its own
// callback was called with and how often.
export default function Controlled() @{
	const log = state({ value: '2026-08-14', calls: 0 });

	<section>
		<calendar.root
			month="2026-08-01"
			value={log.value}
			data-testid="root"
			onChange={(next: CalendarValue) => {
				log.value = typeof next === 'string' ? next : '';
				log.calls = log.calls + 1;
			}}
		>
			<Month />
		</calendar.root>
		<p data-testid="value">{log.value}</p>
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
	</calendar.content>
}
