import { state } from '@markless/core';
import {
	CblkAnchor,
	CblkContent,
	CblkHits,
	CblkItem,
	CblkPicked,
	CblkRoot,
	CblkTitle,
	cblk,
} from './cblk-widget.tsrx';

// A range widget: the first press must take the range arm inside the copied
// method body, so it writes the anchor rather than the picked value. The parts
// sit inside a page-local component that roots nothing, and the items come out
// of a keyed repeat, which is the calendar family's own shape.
export default function CblkRangePage() @{
	let seen = state('none');
	let calls = state(0);

	<section data-cblk-page>
		<CblkRoot range onChange={(next: string) => { calls = calls + 1; seen = next; }}>
			<Month />
			<CblkPicked />
			<CblkAnchor />
			<CblkHits />
		</CblkRoot>
		<output data-cblk-seen>{seen}</output>
		<output data-cblk-calls>{calls}</output>
	</section>
}

function Month() @{
	const c = cblk();

	<CblkContent>
		<CblkTitle>August</CblkTitle>
		<div data-cblk-days>
			@for (const day of c.days; key day) {
				<CblkItem value={day} />
			}
		</div>
	</CblkContent>
}
