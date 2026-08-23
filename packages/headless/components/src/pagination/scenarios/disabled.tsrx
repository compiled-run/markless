import * as pagination from '../index.ts';

// Nothing navigates while the results are loading. Every unavailable-ness on
// this page is the family's own output: the scenario says `disabled` once, on
// the root, and writes no `disabled` and no `aria-current` anywhere else. Which
// controls report shut, and which one reports current, is what the family
// derives from that single fact.
export default function Disabled() @{
	<pagination.root count={5} page={3} disabled data-testid="root">
		<pagination.backtrigger data-testid="backtrigger">Previous</pagination.backtrigger>
		<pagination.item value={2} data-testid="item-2">
			<pagination.itemtrigger data-testid="itemtrigger-2">2</pagination.itemtrigger>
		</pagination.item>
		<pagination.item value={3} data-testid="item-3">
			<pagination.itemtrigger data-testid="itemtrigger-3">3</pagination.itemtrigger>
		</pagination.item>
		<pagination.item value={4} data-testid="item-4">
			<pagination.itemtrigger data-testid="itemtrigger-4">4</pagination.itemtrigger>
		</pagination.item>
		<pagination.item value={5} data-testid="item-5">
			<pagination.itemlink href="#page-5" data-testid="itemlink-5">5</pagination.itemlink>
		</pagination.item>
		<pagination.forwardtrigger data-testid="forwardtrigger">Next</pagination.forwardtrigger>
	</pagination.root>
}
