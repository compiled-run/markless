import { state } from '@markless/core';
import { GroupLabel, GroupRoot, GroupTrigger } from './pwr-group.tsrx';

// The same composition as pwr-rows-page, keyed by the scalar item itself rather
// than by a field of an object row: a list of option values is exactly this
// shape, so the row segment has to reach the minted handle here too.
export default function PwrScalarRowsPage() @{
	let rows = state(['lettuce', 'tomato', 'mustard']);

	<section data-pwr-scalar-rows>
		@for (const row of rows; key row) {
			<div data-row={row}>
				<GroupRoot label={row}>
					<GroupLabel>Row</GroupLabel>
					<GroupTrigger />
				</GroupRoot>
			</div>
		}
	</section>
}
