import { state } from '@markless/core';
import { calendar } from '../../index.ts';
import type { CalendarValue } from '../calendar-types.ts';

// A month with both bounds and two days taken. Every one of those days stays a
// place the keyboard can reach; none of them will be chosen.
export default function Bounded() @{
	const log = state({ value: '', calls: 0 });

	<section>
		<calendar.root
			month="2026-08-01"
			min="2026-08-05"
			max="2026-08-25"
			unavailable={['2026-08-12', '2026-08-13']}
			data-testid="root"
			onChange={(next: CalendarValue) => {
				log.value = typeof next === 'string' ? next : '';
				log.calls = log.calls + 1;
			}}
		>
			<calendar.label data-testid="label">Delivery date</calendar.label>
			<Month />
			<calendar.error data-testid="error">Pick a day we deliver.</calendar.error>
			<calendar.description data-testid="description">
				We deliver from the 5th to the 25th.
			</calendar.description>
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
