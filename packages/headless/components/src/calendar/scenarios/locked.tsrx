import { state } from '@markless/core';
import { calendar } from '../../index.ts';
import type { CalendarValue } from '../calendar-types.ts';

// A whole calendar nobody may change. The month is still drawn, so what the
// keyboard and the month triggers do to a locked calendar is observable.
export default function Locked() @{
	const log = state({ value: '', calls: 0 });

	<section>
		<calendar.root
			month="2026-08-01"
			disabled
			data-testid="root"
			onChange={(next: CalendarValue) => {
				log.value = typeof next === 'string' ? next : '';
				log.calls = log.calls + 1;
			}}
		>
			<calendar.label data-testid="label">Delivery date</calendar.label>
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
		<div data-testid="days">
			@for (const day of cal.days; key day) {
				<calendar.item value={day} data-testid="day" />
			}
		</div>
	</calendar.content>
}
