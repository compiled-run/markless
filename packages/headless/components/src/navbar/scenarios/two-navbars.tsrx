import * as navbar from '../index.ts';

// Two navigation landmarks on one page, which is the ordinary case and the
// reason this family writes no default name: a reader lists landmarks by name,
// and two called "Navigation" are two the person cannot tell apart.
//
// It is also the isolation row. Arrowing inside one navbar must not reach the
// other's controls, and focus leaving one must not close the other's dropdown.
export default function TwoNavbars() @{
	<div>
		<navbar.root aria-label="Primary" hover={false} data-testid="primary-root">
			<navbar.item value="products" data-testid="primary-products-item">
				<navbar.itemtrigger data-testid="primary-products-itemtrigger">Products</navbar.itemtrigger>
				<navbar.itemcontent data-testid="primary-products-itemcontent">
					<navbar.itemlink href="/products/keyboards" data-testid="primary-keyboards-itemlink">
						Keyboards
					</navbar.itemlink>
				</navbar.itemcontent>
			</navbar.item>
			<navbar.item value="pricing" data-testid="primary-pricing-item">
				<navbar.itemlink href="/pricing" data-testid="primary-pricing-itemlink">Pricing</navbar.itemlink>
			</navbar.item>
		</navbar.root>
		<navbar.root aria-label="Footer" hover={false} data-testid="footer-root">
			<navbar.item value="legal" data-testid="footer-legal-item">
				<navbar.itemtrigger data-testid="footer-legal-itemtrigger">Legal</navbar.itemtrigger>
				<navbar.itemcontent data-testid="footer-legal-itemcontent">
					<navbar.itemlink href="/legal/terms" data-testid="footer-terms-itemlink">Terms</navbar.itemlink>
				</navbar.itemcontent>
			</navbar.item>
			<navbar.item value="status" data-testid="footer-status-item">
				<navbar.itemlink href="/status" data-testid="footer-status-itemlink">Status</navbar.itemlink>
			</navbar.item>
		</navbar.root>
	</div>
}
