import * as pagination from '../index.ts';

// Nothing navigates while the results are loading. The two triggers also carry
// consumer attributes that TRY to contradict the family - `disabled={false}` on
// a control the family holds shut, and `aria-current` on a page nobody is on.
// The family writes both after the spread, so the family wins.
export default function Disabled() @{
	<pagination.root count={5} page={3} disabled data-testid="root">
		<pagination.backtrigger data-testid="backtrigger">Previous</pagination.backtrigger>
		<pagination.itemtrigger value={2} disabled={false} data-testid="itemtrigger-2">2</pagination.itemtrigger>
		<pagination.itemtrigger value={3} data-testid="itemtrigger-3">3</pagination.itemtrigger>
		<pagination.itemtrigger value={4} aria-current="page" data-testid="itemtrigger-4">4</pagination.itemtrigger>
		<pagination.itemlink value={5} href="#page-5" data-testid="itemlink-5">5</pagination.itemlink>
		<pagination.forwardtrigger data-testid="forwardtrigger">Next</pagination.forwardtrigger>
	</pagination.root>
}
