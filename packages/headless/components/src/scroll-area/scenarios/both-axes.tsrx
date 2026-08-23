import * as scrollarea from '../index.ts';

// Vertical AND horizontal scrollbars in one area. This is the scenario the QDS
// reference is broken on: it keeps one shared thumb reference for both
// orientations, so the second thumb to render overwrites the first and a click
// on the vertical thumb is mistaken for a track click. Here each thumb is its
// own element reading its own axis timeline, and nothing is shared.
export default function BothAxes() @{
	<scrollarea.root
		data-testid="root"
		style="position: relative; width: 240px; timeline-scope: --sa-y, --sa-x;"
	>
		<scrollarea.viewport
			data-testid="viewport"
			aria-label="Quarterly figures"
			style="overflow: auto; height: 120px; scrollbar-width: none; scroll-timeline: --sa-y block, --sa-x inline;"
		>
			<div style="width: 720px;">
				<p>Revenue rose in every region except the one that lost its distributor.</p>
				<p>Headcount was flat, and contractor spend fell by a fifth.</p>
				<p>The warehouse move landed a month late and under its budget.</p>
				<p>Support volume tracked seats rather than incidents this quarter.</p>
				<p>Renewals closed earlier than last year in two of the four regions.</p>
				<p>Cash conversion improved once the annual invoices went out on time.</p>
			</div>
		</scrollarea.viewport>
		<scrollarea.scrollbar
			data-testid="vertical-scrollbar"
			orientation="vertical"
			style="position: absolute; top: 0; right: 0; width: 8px; height: 100%; background: #eee;"
		>
			<scrollarea.thumb
				data-testid="vertical-thumb"
				style="position: absolute; top: 0; left: 0; width: 8px; height: 24px; background: #888; animation: sa-thumb-y linear both; animation-timeline: --sa-y;"
			/>
		</scrollarea.scrollbar>
		<scrollarea.scrollbar
			data-testid="horizontal-scrollbar"
			orientation="horizontal"
			style="position: absolute; left: 0; bottom: 0; height: 8px; width: 100%; background: #eee;"
		>
			<scrollarea.thumb
				data-testid="horizontal-thumb"
				style="position: absolute; left: 0; top: 0; height: 8px; width: 24px; background: #888; animation: sa-thumb-x linear both; animation-timeline: --sa-x;"
			/>
		</scrollarea.scrollbar>
	</scrollarea.root>
}
