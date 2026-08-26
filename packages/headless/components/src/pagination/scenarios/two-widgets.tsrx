import { pagination } from '../../index.ts';

// Two paginations on one page - reviews above the results, orders below - each
// with its own page and its own count. A page with more than one navigation
// landmark needs each one named, and the family emits no default name, so the
// reviews pagination writes its own.
export default function TwoWidgets() @{
	<section>
		<pagination.root count={3} aria-label="Reviews pages" data-testid="first-root">
			<pagination.backtrigger data-testid="first-backtrigger">Previous</pagination.backtrigger>
			<pagination.item value={1} data-testid="first-item-1">
				<pagination.itemtrigger data-testid="first-itemtrigger-1">1</pagination.itemtrigger>
			</pagination.item>
			<pagination.item value={2} data-testid="first-item-2">
				<pagination.itemtrigger data-testid="first-itemtrigger-2">2</pagination.itemtrigger>
			</pagination.item>
			<pagination.item value={3} data-testid="first-item-3">
				<pagination.itemtrigger data-testid="first-itemtrigger-3">3</pagination.itemtrigger>
			</pagination.item>
			<pagination.forwardtrigger data-testid="first-forwardtrigger">Next</pagination.forwardtrigger>
		</pagination.root>
		<pagination.root count={3} page={2} data-testid="second-root">
			<pagination.backtrigger data-testid="second-backtrigger">Previous</pagination.backtrigger>
			<pagination.item value={1} data-testid="second-item-1">
				<pagination.itemtrigger data-testid="second-itemtrigger-1">1</pagination.itemtrigger>
			</pagination.item>
			<pagination.item value={2} data-testid="second-item-2">
				<pagination.itemtrigger data-testid="second-itemtrigger-2">2</pagination.itemtrigger>
			</pagination.item>
			<pagination.item value={3} data-testid="second-item-3">
				<pagination.itemtrigger data-testid="second-itemtrigger-3">3</pagination.itemtrigger>
			</pagination.item>
			<pagination.forwardtrigger data-testid="second-forwardtrigger">Next</pagination.forwardtrigger>
		</pagination.root>
	</section>
}
