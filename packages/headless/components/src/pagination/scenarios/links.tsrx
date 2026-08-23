import * as pagination from '../index.ts';

// Pagination that is real navigation: every page has a URL, so the controls are
// anchors rather than buttons. A crawler follows them and a person can open one
// in a new tab, which is the whole reason this part exists.
//
// Same anatomy as the button flavour - item > itemlink. The item declares the
// page number and the anchor carries the href, so the two facts a link needs sit
// one on each part rather than both on the anchor.
export default function Links() @{
	<pagination.root count={4} page={2} data-testid="root">
		<pagination.backtrigger data-testid="backtrigger">Previous</pagination.backtrigger>
		<pagination.item value={1} data-testid="item-1">
			<pagination.itemlink href="#page-1" data-testid="itemlink-1">1</pagination.itemlink>
		</pagination.item>
		<pagination.item value={2} data-testid="item-2">
			<pagination.itemlink href="#page-2" data-testid="itemlink-2">2</pagination.itemlink>
		</pagination.item>
		<pagination.item value={3} data-testid="item-3">
			<pagination.itemlink href="#page-3" data-testid="itemlink-3">3</pagination.itemlink>
		</pagination.item>
		<pagination.item value={4} data-testid="item-4">
			<pagination.itemlink href="#page-4" data-testid="itemlink-4">4</pagination.itemlink>
		</pagination.item>
		<pagination.forwardtrigger data-testid="forwardtrigger">Next</pagination.forwardtrigger>
	</pagination.root>
}
