import { state } from '@markless/core';
import { calendar } from '@markless/ui';

export default function App() @{
	const picked = state({ value: 'none' });
	<main>
		<h1>Delivery</h1>
		<calendar.root
			month="2026-08-01"
			onChange={(next: calendar.CalendarValue) => {
				picked.value = typeof next === 'string' ? next : 'none';
			}}
		>
			<calendar.label>Delivery date</calendar.label>
			<Month />
		</calendar.root>
		<p>{`Picked ${picked.value}`}</p>
	</main>
}

function Month() @{
	const cal = calendar.state();
	<calendar.content>
		<calendar.backtrigger>Back</calendar.backtrigger>
		<calendar.title />
		<calendar.forwardtrigger>Forward</calendar.forwardtrigger>
		<div>
			@for (const day of cal.days; key day) {
				<calendar.item value={day} />
			}
		</div>
	</calendar.content>
}
