import { computed, state } from '@markless/core';
import { monthGrid } from '../components/calendar.ts';
import { Layout } from '../components/layout.tsrx';

// A preferences reader on idle starts the page; the date panel and the layout's help stay hidden until opened.
export default function Page() @{
	let ready = state(false);
	let open = state(false);
	let month = state(0);
	const weeks = computed(() => monthGrid(2026, month));

	<Layout>
		<aside data-prefs onIdle={() => (ready = true)}>preferences</aside>
		@if (ready) {
			<p data-ready>ready</p>
		}
		<button type="button" data-open aria-expanded={open ? 'true' : 'false'} onClick={() => (open = !open)}>Pick a date</button>
		<section data-panel hidden={!open}>
			<button type="button" data-next onClick={() => (month = (month + 1) % 12)}>Next month</button>
			<table>
				<tbody>
					@for (const week of weeks; key week.key) {
						<tr>
							@for (const day of week.days; key day.iso) {
								<td class={day.outside ? 'day outside' : 'day'}><button type="button" data-day={day.iso} data-outside={day.outside ? 'true' : undefined}>{day.day}</button></td>
							}
						</tr>
					}
				</tbody>
			</table>
		</section>
	</Layout>
}
