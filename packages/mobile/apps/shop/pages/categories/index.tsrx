import { computed, storage } from '@markless/core';
import { Link } from '@markless/router';
import Shell from '../../lib/Shell.tsrx';
import { itemCount } from '../../lib/cart.ts';
import { loadCategories } from '../../lib/catalog.ts';

export default function Categories() @{
	let cart = storage('cart', '[]');
	const categories = computed(async () => loadCategories());

	<Shell count={itemCount(cart)} title="Categories" tab="categories">
		<style>
			.list {
				display: grid;
				gap: 10px;
				margin: 0;
				padding: 0;
				list-style: none;
			}
			@media (min-width: 700px) {
				.list {
					grid-template-columns: repeat(2, 1fr);
				}
			}
			.row {
				display: flex;
				align-items: center;
				justify-content: space-between;
				gap: 12px;
				padding: 18px;
				border: 1px solid var(--line);
				border-radius: var(--radius);
				background: var(--card);
				text-decoration: none;
			}
			.row:active {
				background: var(--line);
			}
			.blurb {
				display: block;
				color: var(--muted);
				font-size: 14px;
			}
		</style>
		<h1>Categories</h1>
		@try {
			<ul class="list">
				@for (const category of categories; key category.slug) {
					<li>
						<Link href="/categories/[slug]" params={{ slug: category.slug }} class="row">
							<span>
								<strong>{category.name}</strong>
								<span class="blurb">{category.blurb}</span>
							</span>
							<span aria-hidden="true">›</span>
						</Link>
					</li>
				}
			</ul>
		} @pending {
			<p>Loading categories…</p>
		} @catch (error) {
			<p class="problem" role="alert">Couldn't load categories: {error.message}</p>
		}
	</Shell>
}
