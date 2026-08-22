import { state } from '@markless/core';
import { GroupItem, GroupLabel, GroupRoot, GroupTrigger } from './pwr-group.tsrx';

// The checklist anatomy: a keyed loop written INSIDE the enclosing root's
// projected children, each row rooting a widget of its own. Every row's parts
// must mint that row's minted id, not one id shared by the whole loop. The rows
// are scalars keyed by the item itself, exactly as a list of option values is.
export default function PwrItemRowsPage() @{
	let rows = state(['lettuce', 'tomato', 'mustard']);

	<section data-pwr-item-rows>
		<GroupRoot label="all">
			<GroupLabel>All</GroupLabel>
			<GroupTrigger />
			<div data-rows>
				@for (const row of rows; key row) {
					<div data-row={row}>
						<GroupItem label={row}>
							<GroupLabel>Row</GroupLabel>
							<GroupTrigger />
						</GroupItem>
					</div>
				}
			</div>
		</GroupRoot>
	</section>
}
