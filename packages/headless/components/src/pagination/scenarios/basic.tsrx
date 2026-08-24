import { pagination } from '../../index.ts';

// The starter a consumer copies: five pages written out one by one, with a step
// back and a step forward on either side. Nothing computes the range here,
// because with five pages there is nothing to hide.
//
// The anatomy is item > itemtrigger, and the page number is written once, on the
// item. The trigger inside reads it back, so a consumer cannot get the two out
// of step by editing one of them.
//
// The import is the family folder rather than the package barrel because this
// family is not wired into the barrel yet; every other scenario here does the
// same, and they all become `import { pagination } from '../../index.ts'` the
// day the barrel carries it.
export default function Basic() @{
	<pagination.root count={5} data-testid="root">
		<pagination.backtrigger data-testid="backtrigger">Previous</pagination.backtrigger>
		<pagination.item value={1} data-testid="item-1">
			<pagination.itemtrigger data-testid="itemtrigger-1">1</pagination.itemtrigger>
		</pagination.item>
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
			<pagination.itemtrigger data-testid="itemtrigger-5">5</pagination.itemtrigger>
		</pagination.item>
		<pagination.forwardtrigger data-testid="forwardtrigger">Next</pagination.forwardtrigger>
	</pagination.root>
}
