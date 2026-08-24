import { navbar } from '../../index.ts';

// `hover={false}`: the pointer resting on an entry does nothing, and only a
// click opens the dropdown. Every library in the survey offers this, and it is
// what a touch-first site wants.
export default function ClickOnly() @{
	<navbar.root aria-label="Primary" hover={false} data-testid="root">
		<navbar.item value="products" data-testid="products-item">
			<navbar.itemtrigger data-testid="products-itemtrigger">Products</navbar.itemtrigger>
			<navbar.itemcontent data-testid="products-itemcontent">
				<navbar.itemlink href="/products/keyboards" data-testid="keyboards-itemlink">
					Keyboards
				</navbar.itemlink>
			</navbar.itemcontent>
		</navbar.item>
		<navbar.item value="docs" data-testid="docs-item">
			<navbar.itemtrigger data-testid="docs-itemtrigger">Docs</navbar.itemtrigger>
			<navbar.itemcontent data-testid="docs-itemcontent">
				<navbar.itemlink href="/docs/start" data-testid="start-itemlink">Getting started</navbar.itemlink>
			</navbar.itemcontent>
		</navbar.item>
	</navbar.root>
}
