import * as scrollarea from '../index.ts';

// Content shorter than the viewport. The area is still focusable and still
// named - a box that might overflow tomorrow must not lose its keyboard path
// today - and the thumb sits inert at the top because a scroll range of zero
// drives no animation. Nothing measures anything to arrive at that.
export default function NoOverflow() @{
	<scrollarea.root
		data-testid="root"
		style="position: relative; width: 240px; timeline-scope: --sa-y;"
	>
		<scrollarea.viewport
			data-testid="viewport"
			aria-label="Delivery note"
			style="overflow: auto; height: 160px; scrollbar-width: none; scroll-timeline: --sa-y block;"
		>
			<p>One box, left at the side door.</p>
		</scrollarea.viewport>
		<scrollarea.scrollbar
			data-testid="scrollbar"
			style="position: absolute; top: 0; right: 0; width: 8px; height: 100%; background: #eee;"
		>
			<scrollarea.thumb
				data-testid="thumb"
				style="position: absolute; top: 0; left: 0; width: 8px; height: 24px; background: #888; animation: sa-thumb-y linear both; animation-timeline: --sa-y;"
			/>
		</scrollarea.scrollbar>
	</scrollarea.root>
}
