import { navbar } from '../../index.ts';

// The two kinds of control the bar's walk refuses as destinations: an anchor
// with no href, which the platform gives no focus to, and a button the consumer
// disabled outright. Both sit between entries that DO walk, so a step across
// them proves the walk skipped rather than stopped.
export default function UnwalkableControls() @{
	<navbar.root aria-label="Primary" data-testid="root">
		<navbar.item value="home" data-testid="home-item">
			<navbar.itemlink href="/" data-testid="home-itemlink">Home</navbar.itemlink>
		</navbar.item>
		<navbar.item value="placeholder" data-testid="placeholder-item">
			<navbar.itemlink data-testid="placeholder-itemlink">Coming soon</navbar.itemlink>
		</navbar.item>
		<navbar.item value="products" data-testid="products-item">
			<navbar.itemtrigger disabled data-testid="products-itemtrigger">Products</navbar.itemtrigger>
			<navbar.itemcontent data-testid="products-itemcontent">
				<navbar.itemlink href="/products/mice" data-testid="mice-itemlink">Mice</navbar.itemlink>
			</navbar.itemcontent>
		</navbar.item>
		<navbar.item value="docs" data-testid="docs-item">
			<navbar.itemtrigger data-testid="docs-itemtrigger">Docs</navbar.itemtrigger>
			<navbar.itemcontent data-testid="docs-itemcontent">
				<navbar.itemlink href="/docs/api" data-testid="api-itemlink">API</navbar.itemlink>
			</navbar.itemcontent>
		</navbar.item>
	</navbar.root>
}
