import { state } from '@markless/core';
import { GroupLabel, GroupRoot, GroupTrigger } from './pwr-group.tsrx';

// The same composition inside a keyed repeat: each row composes a widget of its
// own, so the row segment has to reach the minted handle as well as the state.
export default function PwrRowsPage() @{
	let rows = state([{ key: 'alpha' }, { key: 'beta' }]);

	<section data-pwr-rows>
		@for (const row of rows; key row.key) {
			<div data-pwr-row={row.key}>
				<GroupRoot label={row.key}>
					<GroupLabel>{row.key}</GroupLabel>
					<GroupTrigger />
				</GroupRoot>
			</div>
		}
	</section>
}
