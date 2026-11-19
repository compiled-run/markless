import { Link } from '@markless/router';
import { money } from './cart.ts';

export default function ProductCard({
	id,
	name,
	price,
	image,
}: {
	readonly id: string;
	readonly name: string;
	readonly price: number;
	readonly image: string;
}) @{
	<>
		<style>
			.card {
				display: grid;
				overflow: hidden;
				border: 1px solid var(--line);
				border-radius: var(--radius);
				background: var(--card);
				box-shadow: var(--shadow);
				text-decoration: none;
			}
			.card:active {
				transform: scale(0.98);
			}
			.card img {
				display: block;
				width: 100%;
				aspect-ratio: 4 / 3;
				object-fit: cover;
			}
			.text {
				display: grid;
				gap: 2px;
				padding: 10px 12px 14px;
			}
			.price {
				color: var(--muted);
			}
		</style>
		<Link href="/products/[id]" params={{ id }} class="card">
			<img src={image} alt="" width="400" height="300" />
			<span class="text">
				<strong>{name}</strong>
				<span class="price">{money(price)}</span>
			</span>
		</Link>
	</>
}
