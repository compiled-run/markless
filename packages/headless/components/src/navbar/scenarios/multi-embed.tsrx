import { navbar } from '../../index.ts';

// One embed's worth of page, mounted twice as two separate islands. Hover intent
// is off so nothing opens on its own, and `pricing` is the last control on the
// bar: the ArrowRight wrap from there stays here or reaches the next embed.
export default function MultiEmbed() @{
	<section data-testid="frame">
		<navbar.root aria-label="Primary" hover={false} data-testid="root">
			<navbar.item value="products" data-testid="products-item">
				<navbar.itemtrigger data-testid="products-itemtrigger">Products</navbar.itemtrigger>
				<navbar.itemcontent data-testid="products-itemcontent">
					<navbar.itemlink href="/products/keyboards" data-testid="keyboards-itemlink">
						Keyboards
					</navbar.itemlink>
				</navbar.itemcontent>
			</navbar.item>
			<navbar.item value="pricing" data-testid="pricing-item">
				<navbar.itemlink href="/pricing" data-testid="pricing-itemlink">Pricing</navbar.itemlink>
			</navbar.item>
		</navbar.root>
	</section>
}
