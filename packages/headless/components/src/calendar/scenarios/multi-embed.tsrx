import { calendar } from '../../index.ts';

// One embed's worth of page, mounted twice as two separate islands by the
// multi-embed battery. The days are written out rather than repeated over
// `calendar.state().days`: a consumer component that reads the family's state is
// a second call site of the widget's shared cell, and the battery counts one
// definition per embed.
export default function MultiEmbed() @{
	<section data-testid="frame">
		<calendar.root month="2026-08-01" data-testid="root">
			<calendar.label data-testid="label">Pick a date</calendar.label>
			<calendar.content data-testid="content">
				<div data-testid="days">
					<calendar.item value="2026-08-10" data-testid="day-2026-08-10" />
					<calendar.item value="2026-08-11" data-testid="day-2026-08-11" />
					<calendar.item value="2026-08-12" data-testid="day-2026-08-12" />
					<calendar.item value="2026-08-13" data-testid="day-2026-08-13" />
					<calendar.item value="2026-08-14" data-testid="day-2026-08-14" />
				</div>
			</calendar.content>
		</calendar.root>
	</section>
}
