import { state } from '@markless/core';
import { calendar } from '../../index.ts';
import type { CalendarValue } from '../calendar-types.ts';

// The same month, revealed rather than shown in place. Nothing about the markup
// inside `calendar.content` changes.
export default function Popup() @{
	const log = state({ value: '', calls: 0 });

	<section>
		<calendar.root
			popup
			month="2026-08-01"
			data-testid="root"
			onChange={(next: CalendarValue) => {
				log.value = typeof next === 'string' ? next : '';
				log.calls = log.calls + 1;
			}}
		>
			<calendar.trigger data-testid="trigger">Choose a date</calendar.trigger>
			<Month />
		</calendar.root>
		<button type="button" data-testid="outside">Elsewhere</button>
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
