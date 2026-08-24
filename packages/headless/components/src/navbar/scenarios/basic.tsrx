import { navbar } from '../../index.ts';

// The starter a consumer copies: a named landmark, one plain link, and two
// entries that show a dropdown. Everything starts closed.
//
// The import is the family folder rather than the package barrel because this
// family is not wired into the barrel yet; every other scenario here does the
// same, and they all become `import { navbar } from '../../index.ts'` the day
// the barrel carries it.
export default function Basic() @{
	<navbar.root aria-label="Primary" data-testid="root">
		<navbar.item value="home" data-testid="home-item">
			<navbar.itemlink href="/" data-testid="home-itemlink">Home</navbar.itemlink>
		</navbar.item>
		<navbar.item value="products" data-testid="products-item">
			<navbar.itemtrigger data-testid="products-itemtrigger">Products</navbar.itemtrigger>
			<navbar.itemcontent data-testid="products-itemcontent">
				<navbar.itemlink href="/products/keyboards" data-testid="keyboards-itemlink">
					Keyboards
				</navbar.itemlink>
				<navbar.itemlink href="/products/mice" data-testid="mice-itemlink">Mice</navbar.itemlink>
			</navbar.itemcontent>
		</navbar.item>
		<navbar.item value="docs" data-testid="docs-item">
			<navbar.itemtrigger data-testid="docs-itemtrigger">Docs</navbar.itemtrigger>
			<navbar.itemcontent data-testid="docs-itemcontent">
				<navbar.itemlink href="/docs/start" data-testid="start-itemlink">Getting started</navbar.itemlink>
				<navbar.itemlink href="/docs/api" data-testid="api-itemlink">API</navbar.itemlink>
			</navbar.itemcontent>
		</navbar.item>
	</navbar.root>
}
