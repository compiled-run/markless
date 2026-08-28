import { calendar } from '../../index.ts';

// A week that starts on Monday. The weekday names and the 42 days move together,
// because both come off the same number.
export default function WeekStart() @{
	<calendar.root month="2026-08-01" startofweek={1} data-testid="root">
		<Month />
	</calendar.root>
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
