import * as scrollarea from '../index.ts';

// Every part spreads `{...rest}` before writing its own attributes, so a
// consumer prop that collides with the part's contract loses and one that does
// not still arrives. This viewport is also deliberately unnamed: the family
// must not invent a name to fill the gap.
export default function SpreadFirst() @{
	<scrollarea.root data-testid="root" data-owner="consumer" style="position: relative; width: 240px;">
		<scrollarea.viewport
			data-testid="viewport"
			role="presentation"
			tabindex={-1}
			data-owner="consumer"
			style="overflow: auto; height: 120px;"
		>
			<p>A note long enough to need scrolling in a box this short.</p>
			<p>The second paragraph is here to push the first one out of view.</p>
			<p>The third makes sure of it on a runner with a different font.</p>
			<p>The fourth is the one that finally overflows a hundred and twenty pixels.</p>
			<p>The fifth is spare.</p>
		</scrollarea.viewport>
		<scrollarea.scrollbar
			data-testid="scrollbar"
			aria-hidden="false"
			data-owner="consumer"
			style="position: absolute; top: 0; right: 0; width: 8px; height: 100%; background: #eee;"
		>
			<scrollarea.thumb
				data-testid="thumb"
				aria-hidden="false"
				data-owner="consumer"
				style="position: absolute; top: 0; left: 0; width: 8px; height: 24px; background: #888;"
			/>
		</scrollarea.scrollbar>
	</scrollarea.root>
}
