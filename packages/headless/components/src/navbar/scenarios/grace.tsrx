import * as navbar from '../index.ts';

// The click-grace window, both halves of it. A dropdown that opened under the
// resting pointer must survive the click that follows - otherwise pointing at an
// entry and then clicking it shuts the panel you were looking at - and a click
// after the window has passed must close it as usual.
//
// The window is long enough here (400 ms) that a test can act inside it, and the
// open delay is 0 so the hover-open lands without a wait.
export default function Grace() @{
	<navbar.root aria-label="Primary" delay={0} clickGrace={400} data-testid="root">
		<navbar.item value="products" data-testid="products-item">
			<navbar.itemtrigger data-testid="products-itemtrigger">Products</navbar.itemtrigger>
			<navbar.itemcontent data-testid="products-itemcontent">
				<navbar.itemlink href="/products/keyboards" data-testid="keyboards-itemlink">
					Keyboards
				</navbar.itemlink>
			</navbar.itemcontent>
		</navbar.item>
	</navbar.root>
}
