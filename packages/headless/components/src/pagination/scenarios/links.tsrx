import * as pagination from '../index.ts';

// Pagination that is real navigation: every page has a URL, so the controls are
// anchors rather than buttons. A crawler follows them and a person can open one
// in a new tab, which is the whole reason this part exists.
export default function Links() @{
	<pagination.root count={4} page={2} data-testid="root">
		<pagination.backtrigger data-testid="backtrigger">Previous</pagination.backtrigger>
		<pagination.itemlink value={1} href="#page-1" data-testid="itemlink-1">1</pagination.itemlink>
		<pagination.itemlink value={2} href="#page-2" data-testid="itemlink-2">2</pagination.itemlink>
		<pagination.itemlink value={3} href="#page-3" data-testid="itemlink-3">3</pagination.itemlink>
		<pagination.itemlink value={4} href="#page-4" data-testid="itemlink-4">4</pagination.itemlink>
		<pagination.forwardtrigger data-testid="forwardtrigger">Next</pagination.forwardtrigger>
	</pagination.root>
}
