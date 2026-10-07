// Computed page preview: a click changes one count, and the stage shows whether the recipe ran and moved the total.
import { computed, element, state } from '@markless/core';
import PreviewCard, { Controls, Mono, Stage, Switch, Watch } from '../../docs/preview-card.tsrx';
import Code from '../../docs/preview-card/code.tsrx';
import Basket from './basket.tsrx';
import BasketMugsOnly from './basket-mugs-only.tsrx';
import { takeTextChanges, watchText } from './changes.ts';
import { basket, basketMugsOnly } from './code-panes.ts';
import { afterUpdate, placeOverText } from './place.ts';
import { Board, Ledger, LivePage, Row } from './trace.tsrx';

const lastNumber = /\d+\s*$/;

const valueOf = (element: Element | undefined): string => lastNumber.exec(element?.textContent ?? '')?.[0]?.trim() ?? '';

const named = (elements: Element[], start: string): Element | undefined =>
	elements.find((element) => (element.textContent ?? '').trim().startsWith(start));

export default function ComputedSketch() @{
	let reads = state(true);
	let input = state('');
	let total = state('');
	let totalMoved = state(false);
	let markInput = state('');
	let markTotal = state('');
	let full = element<HTMLDivElement>();
	let partial = element<HTMLDivElement>();
	const handler = computed(() => input + '++');
	const recipeNote = computed(() => {
		if (input === '') return 'waiting for a click';
		if (totalMoved) return 'ran again, because it reads ' + input;
		return 'not run: it does not read ' + input;
	});
	const totalNote = computed(() => {
		if (input === '') return 'no click writes it';
		return totalMoved ? 'now ' + total + ', and no click wrote it' : 'still ' + total;
	});
	const said = computed(() => {
		if (totalMoved) return 'The recipe reads ' + input + ', so it ran again. The total is now ' + total + '.';
		return 'The recipe does not read ' + input + ', so the total stayed ' + total + '.';
	});

	<PreviewCard name="computed-basket" label="Who updates the total">
		<Controls title="Who updates the total?">
			<Switch
				label="Recipe reads coasters"
				hint="Off swaps in a recipe that only reads mugs: computed(() => mugs * 12)."
				checked
				onChange={(on: boolean) => {
					reads = on;
					input = '';
				}}
			/>
		</Controls>
		<Stage>
			<Board>
				<LivePage>
					<div
						class="slot"
						hidden={!reads}
						el={full}
						onPointerOver={() => watchText(full)}
						onFocusIn={() => watchText(full)}
						onClick={(event) => {
							const target = event.target;
							const button = target instanceof Element ? target.closest('button') : null;
							if (!button) return;
							input = (button.textContent ?? '').includes('coaster') ? 'coasters' : 'mugs';
							afterUpdate(() => {
								const elements = takeTextChanges(full);
								const changedTotal = named(elements, 'Total');
								const lines = full ? full.querySelectorAll('p') : [];
								totalMoved = changedTotal !== undefined;
								total = valueOf(lines[2]);
								markInput = placeOverText(full, named(elements, input === 'mugs' ? 'Mugs' : 'Coasters'), lastNumber);
								markTotal = placeOverText(full, changedTotal, lastNumber);
							});
						}}
					>
						<Basket />
						<span class="mark" aria-hidden="true" hidden={input === '' || markInput === ''} style={markInput}></span>
						<span class="mark" aria-hidden="true" hidden={input === '' || markTotal === '' || !totalMoved} style={markTotal}></span>
					</div>
					<div
						class="slot"
						hidden={reads}
						el={partial}
						onPointerOver={() => watchText(partial)}
						onFocusIn={() => watchText(partial)}
						onClick={(event) => {
							const target = event.target;
							const button = target instanceof Element ? target.closest('button') : null;
							if (!button) return;
							input = (button.textContent ?? '').includes('coaster') ? 'coasters' : 'mugs';
							afterUpdate(() => {
								const elements = takeTextChanges(partial);
								const changedTotal = named(elements, 'Total');
								const lines = partial ? partial.querySelectorAll('p') : [];
								totalMoved = changedTotal !== undefined;
								total = valueOf(lines[2]);
								markInput = placeOverText(partial, named(elements, input === 'mugs' ? 'Mugs' : 'Coasters'), lastNumber);
								markTotal = placeOverText(partial, changedTotal, lastNumber);
							});
						}}
					>
						<BasketMugsOnly />
						<span class="mark" aria-hidden="true" hidden={input === '' || markInput === ''} style={markInput}></span>
						<span class="mark" aria-hidden="true" hidden={input === '' || markTotal === '' || !totalMoved} style={markTotal}></span>
					</div>
				</LivePage>
				<Ledger label="What ran and what changed">
					<Row name={'{mugs}'}>
						<span data-hot={input === 'mugs' ? 'true' : 'false'}>{input === 'mugs' ? 'changed by the click' : 'as it was'}</span>
					</Row>
					<Row name={'{coasters}'}>
						<span data-hot={input === 'coasters' ? 'true' : 'false'}>{input === 'coasters' ? 'changed by the click' : 'as it was'}</span>
					</Row>
					<div class="optional" hidden={!reads}>
						<Row name="mugs * 12 + coasters * 3">
							<span data-hot={input !== '' && totalMoved ? 'true' : 'false'}>{recipeNote}</span>
						</Row>
					</div>
					<div class="optional" hidden={reads}>
						<Row name="mugs * 12">
							<span data-hot={input !== '' && totalMoved ? 'true' : 'false'}>{recipeNote}</span>
						</Row>
					</div>
					<Row name={'{total}'}>
						<span data-hot={input !== '' && totalMoved ? 'true' : 'false'}>{totalNote}</span>
					</Row>
				</Ledger>
			</Board>
		</Stage>
		<Watch>
			<span hidden={input === ''}>
				The click ran <Mono><span>{handler}</span></Mono>. {said}
			</span>
			<span hidden={input !== '' || !reads}>
				No button writes <Mono>total</Mono>. The recipe works it out from <Mono>mugs</Mono> and <Mono>coasters</Mono>.
			</span>
			<span hidden={input !== '' || reads}>
				No button writes <Mono>total</Mono>. This recipe works it out from <Mono>mugs</Mono> alone.
			</span>
		</Watch>
		<div class="variant" hidden={!reads}>
			<Code files={basket} />
		</div>
		<div class="variant" hidden={reads}>
			<Code files={basketMugsOnly} />
		</div>
		<style>
			.slot {
				position: relative;
			}

			.mark {
				position: absolute;
				border-radius: 4px;
				background: color-mix(in srgb, var(--purple) 70%, var(--paper));
				mix-blend-mode: multiply;
				pointer-events: none;

				html.dark & {
					background: color-mix(in srgb, var(--purple) 45%, var(--paper));
					mix-blend-mode: screen;
				}
			}

			.mark[hidden],
			.slot[hidden],
			.optional[hidden],
			.variant[hidden] {
				display: none;
			}

			.optional,
			div.variant {
				display: contents;
			}
		</style>
	</PreviewCard>
}
