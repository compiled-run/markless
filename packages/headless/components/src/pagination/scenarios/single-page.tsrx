import * as pagination from '../index.ts';

// One page of results. Both step controls are unavailable at once, because page
// 1 is also the last page - the boundary case that catches a family which only
// checks one end.
export default function SinglePage() @{
	<pagination.root count={1} data-testid="root">
		<pagination.backtrigger data-testid="backtrigger">Previous</pagination.backtrigger>
		<pagination.itemtrigger value={1} data-testid="itemtrigger-1">1</pagination.itemtrigger>
		<pagination.forwardtrigger data-testid="forwardtrigger">Next</pagination.forwardtrigger>
	</pagination.root>
}
