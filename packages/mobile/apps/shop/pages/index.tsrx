import { computed, state, storage } from '@markless/core';
import ProductCard from '../lib/ProductCard.tsrx';
import Shell from '../lib/Shell.tsrx';
import { itemCount } from '../lib/cart.ts';
import { loadProducts } from '../lib/catalog.ts';

export default function ShopHome() @{
	let refreshes = state(0);
	let cart = storage('cart', '[]');
	const products = computed(async () => {
		refreshes;
		return loadProducts();
	});

	<Shell count={itemCount(cart)} title="Shop" tab="shop">
		<div class="heading">
			<h1>New this week</h1>
			<button type="button" class="button" onClick={() => refreshes++}>
				Refresh
			</button>
		</div>
		@try {
			<ul class="grid">
				@for (const product of products; key product.id) {
					<li>
						<ProductCard
							id={product.id}
							name={product.name}
							price={product.price}
							image={product.image}
						/>
					</li>
				}
			</ul>
		} @pending {
			<ul class="grid" aria-label="Loading products">
				@for (const slot of [1, 2, 3, 4]; key slot) {
					<li class="skeleton"></li>
				}
			</ul>
		} @catch (error, reset) {
			<div class="problem" role="alert">
				<p>Couldn't load products: {error.message}</p>
				<button type="button" class="button" onClick={reset}>
					Try again
				</button>
			</div>
		}
	</Shell>
}
