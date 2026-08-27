import { element, state } from '@markless/core';

// A month change: every keyed row is replaced, because every key changes. The
// handler writes the new collection and then focuses the row carrying the key
// it just wrote, off the plural handle the rows bind.
export default function WriteThenFocusKeyedRemintPage() @{
	let days = state(['2026-08-01', '2026-08-02', '2026-08-03']);
	let rowsSeen = state('unread');
	const dayEls = element<HTMLButtonElement[]>();

	<section data-write-then-focus="keyed">
		<button
			type="button"
			data-testid="next-month"
			onClick={() => {
				days = ['2026-09-01', '2026-09-02', '2026-09-03'];
				const minted = dayEls ?? [];
				rowsSeen = minted.map((day) => day.getAttribute('value') ?? '?').join(',');
				minted.find((day) => day.getAttribute('value') === '2026-09-02')?.focus();
			}}
		>next month</button>
		<div data-testid="days">
			@for (const day of days; key day) {
				<button type="button" data-day value={day} el={dayEls}>{day}</button>
			}
		</div>
		<output data-testid="rows-seen">{rowsSeen}</output>
	</section>
}
