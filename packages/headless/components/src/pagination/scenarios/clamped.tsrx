import * as pagination from '../index.ts';

// A page number out of range, which is what a bookmarked `?page=99` looks like
// after the results shrank. Page 20 is the one showing, so the last control is
// the current one and forward is already at the end.
export default function Clamped() @{
	<pagination.root count={20} page={99} data-testid="root">
		<pagination.backtrigger data-testid="backtrigger">Previous</pagination.backtrigger>
		<pagination.itemtrigger value={18} data-testid="itemtrigger-18">18</pagination.itemtrigger>
		<pagination.itemtrigger value={19} data-testid="itemtrigger-19">19</pagination.itemtrigger>
		<pagination.itemtrigger value={20} data-testid="itemtrigger-20">20</pagination.itemtrigger>
		<pagination.forwardtrigger data-testid="forwardtrigger">Next</pagination.forwardtrigger>
	</pagination.root>
}
