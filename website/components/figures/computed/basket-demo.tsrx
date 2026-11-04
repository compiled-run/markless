// The Computed page's live demo: a basket whose total is a recipe over two counts.
import { computed, state } from '@markless/core';
import InkButton from '../ink/ink-button.tsrx';
import InkScreen from '../ink/ink-screen.tsrx';
import MarginNotes, { Notes, NoteTitle, Spot, Spots, Tally } from '../ink/margin-notes.tsrx';
import Ring from '../ink/ring.tsrx';
import { COASTER, describeBasket, MUG, times } from './model.ts';

export default function BasketDemo() @{
	let mugs = state(1);
	let coasters = state(0);
	let presses = state(0);
	const total = computed(() => mugs * MUG + coasters * COASTER);
	const runs = computed(() => times(presses + 1));
	const said = computed(() => (presses === 0 ? '' : describeBasket(mugs, coasters, presses + 1)));

	<MarginNotes said={said}>
		<InkScreen url="beanshop.dev/basket" label="Live preview of a shop basket">
			<div class="page">
				<p class="line">Mugs at ${MUG}: <strong>{mugs}</strong> <Ring n={1} /></p>
				<p class="line">Coasters at ${COASTER}: <strong>{coasters}</strong> <Ring n={2} /></p>
				<p class="line total">Total: <strong>${total}</strong> <Ring n={3} /></p>
				<div class="choices">
					<InkButton
						onClick={() => {
							mugs++;
							presses++;
						}}
					>
						Add a mug
					</InkButton>
					<InkButton
						alt
						onClick={() => {
							coasters++;
							presses++;
						}}
					>
						Add a coaster
					</InkButton>
				</div>
				<style>
					.page {
						display: grid;
						justify-items: center;
						gap: 0.45rem;
						padding: 1rem 2rem 1.4rem;
					}

					.line {
						display: flex;
						align-items: center;
						gap: 0.35rem;
						margin: 0;
						font-size: 1.1rem;
					}

					.total {
						margin-block: 0.2rem 0.5rem;
						padding-block-start: 0.35rem;
						border-block-start: 1.5px solid currentColor;
						font-size: 1.3rem;
						font-weight: 800;
					}

					.choices {
						display: flex;
						flex-wrap: wrap;
						justify-content: center;
						gap: 0.6rem;
					}
				</style>
			</div>
		</InkScreen>
		<Notes>
			<NoteTitle><code>total</code> reads two values</NoteTitle>
			<Spots>
				<Spot n={1} code="mugs">a count a button changes</Spot>
				<Spot n={2} code="coasters">a count a button changes</Spot>
				<Spot n={3} code={'{total}'}>the recipe's answer</Spot>
			</Spots>
			<Tally>
				The recipe ran <strong>{runs}</strong>: once to set up the page, then once per press.
				<br />
				No handler touches <code>total</code>.
			</Tally>
		</Notes>
	</MarginNotes>
}
