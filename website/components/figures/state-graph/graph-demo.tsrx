// The State graph page's live demo: a cart on an inked page, with margin notes naming the node each line subscribes to.
import { computed, state } from '@markless/core';
import InkButton from '../ink/ink-button.tsrx';
import InkScreen from '../ink/ink-screen.tsrx';
import MarginNotes, { Notes, NoteTitle, Spot, Spots, Tally } from '../ink/margin-notes.tsrx';
import Ring from '../ink/ring.tsrx';
import { describe, presses, START_BAGS, totalFor } from './model.ts';

export default function GraphDemo() @{
	let bags = state(START_BAGS);
	let count = state(0);
	const total = computed(() => totalFor(bags));
	const ran = computed(() => presses(count));
	const entries = computed(() => count * 2);
	const said = computed(() => (count === 0 ? '' : describe(bags)));

	<MarginNotes said={said}>
		<InkScreen url="beanshop.dev/cart" label="Live preview of a cart">
			<div class="page">
				<p class="product">House blend · 250 g</p>
				<p class="line">
					<span>In your cart: {bags} bags</span>
					<Ring n={1} />
				</p>
				<p class="line">
					<span>Total: ${total}</span>
					<Ring n={2} />
				</p>
				<InkButton
					onClick={() => {
						bags++;
						count++;
					}}
				>
					Add to cart
				</InkButton>
				<style>
					.page {
						display: grid;
						justify-items: center;
						gap: 0.55rem;
						padding: 1rem 2rem 1.4rem;
					}

					.product {
						margin: 0;
						font-size: 1rem;
						opacity: 0.8;
					}

					.line {
						display: flex;
						align-items: center;
						gap: 0.4rem;
						margin: 0;
						font-size: 1.25rem;
						font-weight: 700;
					}
				</style>
			</div>
		</InkScreen>
		<Notes>
			<NoteTitle>2 lines subscribe</NoteTitle>
			<Spots roomy>
				<Spot n={1} code={'{bags}'}>reads the node <code>state:bags</code></Spot>
				<Spot n={2} code={'{total}'}>reads <code>computed:total</code>, which reads <code>state:bags</code></Spot>
			</Spots>
			<Tally>
				The click ran <strong>{ran}</strong>. For the cart code above, that is <strong>{entries}</strong> <code>setText</code> entries in the journal.
				<br />
				The product line subscribes to nothing, so it was written <strong>0 times</strong>.
			</Tally>
		</Notes>
	</MarginNotes>
}
