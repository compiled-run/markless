import { state } from '@markless/core';
import { KirItem, KirRoot } from './kir-family.tsrx';

// Defect 75: the items come from a keyed loop, so each one is a widget root
// rendered INSIDE a repeat row.
export default function KirLoopPage() @{
	let fruits = state(['apple', 'banana', 'cherry']);

	<section data-kir-page>
		<KirRoot>
			@for (const fruit of fruits; key fruit) {
				<KirItem value={fruit}>{fruit}</KirItem>
			}
		</KirRoot>
	</section>
}
