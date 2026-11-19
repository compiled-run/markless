import { computed, storage } from '@markless/core';
import { Link, type PageProps } from '@markless/router';
import ProductCard from '../../lib/ProductCard.tsrx';
import Shell from '../../lib/Shell.tsrx';
import { itemCount } from '../../lib/cart.ts';
import { loadProducts } from '../../lib/catalog.ts';

export default function Category({ params }: PageProps<{ slug: string }>) @{
	let cart = storage('cart', '[]');
	const products = computed(async () => loadProducts(params.slug));
	const name = params.slug.charAt(0).toUpperCase() + params.slug.slice(1);

	<Shell count={itemCount(cart)} title={name} tab="categories">
		<div class="heading">
			<h1>{name}</h1>
			<Link href="/categories" class="button">
				All categories
			</Link>
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
				<p>{error.message}</p>
				<button type="button" class="button" onClick={reset}>
					Try again
				</button>
			</div>
		}
	</Shell>
}
