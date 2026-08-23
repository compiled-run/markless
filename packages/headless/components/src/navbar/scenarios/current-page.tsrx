import * as navbar from '../index.ts';

// The page a person is on now, said in ARIA. `current` sits on the ONE link that
// is that page - here a link inside a dropdown - and `active` sits on the item
// whose section it belongs to, which is styling only.
//
// This is the aria-at disclosure-navigation plan's `stateCurrentPage` assertion,
// priority 1, and it is the row the QDS reference cannot make: its `spec.md`
// designed `navbar.itemlink` and its code never shipped it.
export default function CurrentPage() @{
	<navbar.root aria-label="Primary" data-testid="root">
		<navbar.item value="home" data-testid="home-item">
			<navbar.itemlink href="/" data-testid="home-itemlink">Home</navbar.itemlink>
		</navbar.item>
		<navbar.item value="docs" active data-testid="docs-item">
			<navbar.itemtrigger data-testid="docs-itemtrigger">Docs</navbar.itemtrigger>
			<navbar.itemcontent data-testid="docs-itemcontent">
				<navbar.itemlink href="/docs/start" data-testid="start-itemlink">Getting started</navbar.itemlink>
				<navbar.itemlink href="/docs/api" current data-testid="api-itemlink">API</navbar.itemlink>
			</navbar.itemcontent>
		</navbar.item>
	</navbar.root>
}
