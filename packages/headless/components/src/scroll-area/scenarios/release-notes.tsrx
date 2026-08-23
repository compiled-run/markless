import * as scrollarea from '../index.ts';

// The realistic one: a painted vertical scrollbar over a hidden native one.
// The thumb's position is CSS and nothing else - the viewport names a scroll
// timeline, the root puts that name in scope, and the thumb animates its `top`
// along it. There is no JavaScript in this scenario at all.
export default function ReleaseNotes() @{
	<section>
		<h2>Release notes</h2>
		<scrollarea.root
			data-testid="root"
			style="position: relative; width: 260px; timeline-scope: --sa-y;"
		>
			<scrollarea.viewport
				data-testid="viewport"
				aria-label="Release notes"
				style="overflow: auto; height: 120px; scrollbar-width: none; scroll-timeline: --sa-y block;"
			>
				<p>2.4.0 adds a keyboard path through the settings list.</p>
				<p>2.3.2 fixes the export dialog closing on the first keystroke.</p>
				<p>2.3.1 restores the undo history after a failed save.</p>
				<p>2.3.0 replaces the polling status bar with a pushed one.</p>
				<p>2.2.4 stops the sidebar reordering itself on a slow network.</p>
				<p>2.2.3 makes the search field keep focus after a filter change.</p>
				<p>2.2.2 removes a duplicate confirmation on bulk delete.</p>
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
	</section>
}
