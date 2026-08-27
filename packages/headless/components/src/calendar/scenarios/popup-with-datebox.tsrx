import { state } from '@markless/core';
import { calendar, datebox } from '../../index.ts';
import type { CalendarValue } from '../calendar-types.ts';

/**
 * A date picker: a typed date and a month that reveal the same value.
 *
 * The two families do not talk to each other - a part resolves to the innermost
 * root of its own family, and there is no channel across - so the page holds the
 * date and feeds both. Four lines, no new capability, and one source of truth.
 */
export default function PopupWithDateBox() @{
	const picked = state({ value: '2026-08-14' });

	<section>
		<datebox.root
			value={picked.value}
			name="arrival"
			data-testid="datebox-root"
			onChange={(next: string | null) => {
				picked.value = next ?? '';
			}}
		>
			<datebox.label data-testid="datebox-label">Arrival</datebox.label>
			<datebox.monthinput data-testid="monthinput" />
			<datebox.dayinput data-testid="dayinput" />
			<datebox.yearinput data-testid="yearinput" />
		</datebox.root>
		<calendar.root
			popup
			month="2026-08-01"
			value={picked.value}
			data-testid="root"
			onChange={(next: CalendarValue) => {
				picked.value = typeof next === 'string' ? next : '';
			}}
		>
			<calendar.trigger data-testid="trigger">Choose a date</calendar.trigger>
			<Month />
		</calendar.root>
		<p data-testid="shared">{picked.value}</p>
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
