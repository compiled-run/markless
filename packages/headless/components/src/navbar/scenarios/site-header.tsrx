import { navbar } from '../../index.ts';

// The realistic one: a mega menu (a wide dropdown with a grid of links inside),
// a plain top-level link, and a sign-in button OUTSIDE the nav so the focus-out
// row has somewhere to go.
//
// A mega menu is not a separate family. It is one `navbar.itemcontent` with more
// markup in it, which is exactly what "headless" means here: the panel takes any
// children, and the family only decides whether it shows.
export default function SiteHeader() @{
	<header>
		<navbar.root aria-label="Primary" data-testid="root">
			<navbar.item value="products" data-testid="products-item">
				<navbar.itemtrigger data-testid="products-itemtrigger">Products</navbar.itemtrigger>
				<navbar.itemcontent data-testid="products-itemcontent">
					<div data-testid="products-grid">
						<section>
							<h3>Hardware</h3>
							<navbar.itemlink href="/products/keyboards" data-testid="keyboards-itemlink">
								Keyboards
							</navbar.itemlink>
							<navbar.itemlink href="/products/mice" data-testid="mice-itemlink">Mice</navbar.itemlink>
						</section>
						<section>
							<h3>Software</h3>
							<navbar.itemlink href="/products/studio" data-testid="studio-itemlink">Studio</navbar.itemlink>
							<navbar.itemlink href="/products/cloud" data-testid="cloud-itemlink">Cloud</navbar.itemlink>
						</section>
					</div>
				</navbar.itemcontent>
			</navbar.item>
			<navbar.item value="pricing" data-testid="pricing-item">
				<navbar.itemlink href="/pricing" data-testid="pricing-itemlink">Pricing</navbar.itemlink>
			</navbar.item>
		</navbar.root>
		<button type="button" data-testid="signin">Sign in</button>
	</header>
}
