import { calendar } from '../../index.ts';

// The starter a consumer copies: a month fixed to August 2026 so a test can say
// what it holds, with the element a form submits.
export default function Basic() @{
	<calendar.root month="2026-08-01" name="starts" data-testid="root">
		<calendar.label data-testid="label">Pick a date</calendar.label>
		<Month />
		<calendar.field data-testid="field" />
	</calendar.root>
}

// The month is the consumer's own markup, and it sits INSIDE the root: a
// component that reads the calendar's state is a part of that calendar's widget,
// and one placed outside would start a second calendar of its own. A construct
// may not be the direct child of a component tag either, so each repeat opens in
// a plain element.
function Month() @{
	const cal = calendar.state();

	<calendar.content data-testid="content">
		<div data-testid="head">
			<calendar.backtrigger data-testid="back">Back</calendar.backtrigger>
			<calendar.title data-testid="title" />
			<calendar.forwardtrigger data-testid="forward">Forward</calendar.forwardtrigger>
		</div>
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
