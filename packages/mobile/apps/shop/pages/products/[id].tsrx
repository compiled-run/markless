import { computed, state, storage } from '@markless/core';
import { native, platform } from '@markless/device';
import { Link, type PageProps } from '@markless/router';
import { drawer } from '@markless/ui';
import Shell from '../../lib/Shell.tsrx';
import { addLine, itemCount, money } from '../../lib/cart.ts';
import { loadProduct } from '../../lib/catalog.ts';

function Options({
	options,
	picked,
	onPick,
}: {
	readonly options: readonly string[];
	readonly picked: string;
	readonly onPick: (option: string) => void;
}) @{
	<>
		<style>
			.options {
				display: grid;
				gap: 8px;
			}
			.option {
				min-height: 48px;
				padding: 12px 16px;
				border: 1px solid var(--line);
				border-radius: 12px;
				background: var(--paper);
				text-align: left;
			}
			.option[aria-pressed='true'] {
				border-color: var(--accent);
				font-weight: 600;
			}
			.option:active {
				background: var(--line);
			}
		</style>
		<div class="options" role="group" aria-label="Options">
			@for (const option of options; key option) {
				<button
					type="button"
					class="option"
					aria-pressed={option === picked}
					onClick={() => onPick(option)}
				>
					{option}
				</button>
			}
		</div>
	</>
}

export default function ProductPage({ params }: PageProps<{ id: string }>) @{
	let cart = storage('cart', '[]');
	let picked = state('');
	let choosing = state(false);
	let added = state(false);
	const product = computed(async () => loadProduct(params.id));

	<Shell count={itemCount(cart)} title="Product" tab="shop">
		<style>
			.product {
				display: grid;
				gap: 18px;
			}
			@media (min-width: 700px) {
				.product {
					grid-template-columns: 1fr 1fr;
					align-items: start;
					gap: 32px;
				}
			}
			.photo {
				width: 100%;
				border-radius: var(--radius);
			}
			.details {
				display: grid;
				gap: 14px;
			}
			.details h1,
			.price {
				margin: 0;
			}
			.price {
				font-size: 22px;
				font-weight: 600;
			}
			.description {
				margin: 0;
				color: var(--muted);
			}
			.buy {
				display: grid;
				grid-template-columns: 1fr 1fr;
				gap: 10px;
			}
			.button[aria-disabled='true'],
			.button:disabled {
				opacity: 0.45;
			}
			.added {
				margin: 0;
				font-weight: 600;
				color: var(--accent);
			}
			.sheet {
				z-index: 10;
				display: grid;
				gap: 14px;
				padding: 20px 20px 32px;
				border-radius: 20px 20px 0 0;
				background: var(--card);
			}
			.sheet-title {
				margin: 0;
				font-size: 20px;
				font-weight: 600;
			}
		</style>
		@try {
			<article class="product">
				<img class="photo" src={product.image} alt={product.name} width="400" height="300" />
				<div class="details">
					<h1>{product.name}</h1>
					<p class="price">{money(product.price)}</p>
					<p class="description">{product.description}</p>
					<div class="buy">
						<button type="button" class="button" onClick={() => (choosing = true)}>
							{picked === '' ? 'Choose option' : picked}
						</button>
						<button
							type="button"
							class="button primary"
							disabled={picked === ''}
							onClick={() => {
								cart = addLine(cart, product, picked);
								added = true;
							}}
						>
							Add to cart
						</button>
					</div>
					<p class="added" role="status" hidden={!added}>
						Added to your cart
					</p>
					<Link href="/cart" class="button">
						Go to cart
					</Link>
				</div>
				@if (!platform.web) {
					<native.sheet
						open={choosing}
						onChange={(open) => (choosing = open)}
						snapPoints={[0.5]}
					>
						<div class="sheet">
							<h2 class="sheet-title">Choose an option</h2>
							<Options
								options={product.options}
								picked={picked}
								onPick={(option) => {
									picked = option;
									choosing = false;
								}}
							/>
						</div>
					</native.sheet>
				} @else {
					<drawer.root open={choosing} onChange={(open: boolean) => (choosing = open)}>
						<drawer.backdrop>
							<drawer.content class="sheet">
								<drawer.title class="sheet-title">Choose an option</drawer.title>
								<Options
									options={product.options}
									picked={picked}
									onPick={(option) => {
										picked = option;
										choosing = false;
									}}
								/>
								<drawer.close class="button">Done</drawer.close>
							</drawer.content>
						</drawer.backdrop>
					</drawer.root>
				}
			</article>
		} @pending {
			<p>Loading the product…</p>
		} @catch (error) {
			<div class="problem" role="alert">
				<p>{error.message}</p>
				<Link href="/" class="button">
					Back to the shop
				</Link>
			</div>
		}
	</Shell>
}
