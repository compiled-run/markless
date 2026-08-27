import { state } from '@markless/core';
import { calendar } from '../../index.ts';
import type { CalendarValue } from '../calendar-types.ts';

// Several days at once. A day already chosen is unchosen by pressing it again.
export default function Multiple() @{
	const log = state({ chosen: '2026-08-04', calls: 0 });

	<section>
		<calendar.root
			multiple
			month="2026-08-01"
			value={['2026-08-04']}
			data-testid="root"
			onChange={(next: CalendarValue) => {
				log.chosen = (next as readonly string[]).join(',');
				log.calls = log.calls + 1;
			}}
		>
			<Month />
		</calendar.root>
		<p data-testid="chosen">{log.chosen}</p>
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
