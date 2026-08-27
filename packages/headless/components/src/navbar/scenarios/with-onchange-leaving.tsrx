import { state } from '@markless/core';
import { navbar } from '../../index.ts';

// The consumer's callback plus somewhere outside the landmark to go: closing by
// leaving - with the pointer or with focus - is the root's own handler, and this
// is the page that lets a row drive it.
export default function WithOnChangeLeaving() @{
	const log = state({ value: 'none', calls: 0 });

	<header>
		<navbar.root
			aria-label="Primary"
			data-testid="root"
			onChange={(next: string) => {
				log.value = next === '' ? 'none' : next;
				log.calls = log.calls + 1;
			}}
		>
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
		<button type="button" data-testid="signin">Sign in</button>
		<p data-testid="value">{log.value}</p>
		<p data-testid="calls">{log.calls}</p>
	</header>
}
