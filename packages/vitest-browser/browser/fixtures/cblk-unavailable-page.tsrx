import { state } from '@markless/core';
import {
	CblkContent,
	CblkHits,
	CblkItem,
	CblkPicked,
	CblkRoot,
	CblkTitle,
	cblk,
} from './cblk-widget.tsrx';

// An array-valued root prop read from a part's computed(): the same element
// carries both rules, so a cell that arrives undefined contradicts itself.
export default function CblkUnavailablePage() @{
	let seen = state('none');

	<section data-cblk-page>
		<CblkRoot unavailable={['2026-08-12']} onChange={(next: string) => { seen = next; }}>
			<Month />
			<CblkPicked />
			<CblkHits />
		</CblkRoot>
		<output data-cblk-seen>{seen}</output>
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
