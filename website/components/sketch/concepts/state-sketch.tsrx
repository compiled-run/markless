// State page preview: the reader pours, and the stage reports which text the click really changed.
import { computed, element, state } from '@markless/core';
import PreviewCard, { Controls, Mono, Stage, Switch, Watch } from '../../docs/preview-card.tsrx';
import Code from '../../docs/preview-card/code.tsrx';
import { takeTextChanges, watchText } from './changes.ts';
import { pour, pourTwice } from './code-panes.ts';
import { afterUpdate, placeOverText } from './place.ts';
import Pour from './pour.tsrx';
import PourTwice from './pour-twice.tsrx';
import { Board, Ledger, LivePage, Row } from './trace.tsrx';

const drawnIn = (slot: HTMLElement | undefined): string =>
	/\d+/.exec(slot?.querySelectorAll('p')[1]?.textContent ?? '')?.[0] ?? '';

const textOf = (element: Element): string => (element.textContent ?? '').trim();

const lastNumber = /\d+\s*$/;

const times = (count: number): string => (count === 1 ? '1 time' : count + ' times');

export default function StateSketch() @{
	let twice = state(false);
	let onceClicks = state(0);
	let twiceClicks = state(0);
	let onceDrawnChanges = state(0);
	let twiceDrawnChanges = state(0);
	let changed = state<string[]>([]);
	let drawn = state('');
	let last = state('');
	let markA = state('');
	let markB = state('');
	let once = element<HTMLDivElement>();
	let both = element<HTMLDivElement>();
	const clicks = computed(() => (twice ? twiceClicks : onceClicks));
	const cupsNote = computed(() => (clicks === 0 ? 'waiting for a click' : 'changed ' + times(clicks)));
	const buttonNote = computed(() => (twiceClicks === 0 ? 'waiting for a click' : 'changed ' + times(twiceClicks)));
	const drawnChanges = computed(() => (twice ? twiceDrawnChanges : onceDrawnChanges));
	const drawnNote = computed(() => (drawnChanges === 0 ? 'never changed' : 'changed ' + times(drawnChanges)));
	const ranNote = computed(() => 'ran ' + times(clicks));
	const changedNote = computed(() => {
		const count = changed.length === 1 ? 'one piece of text' : changed.length + ' pieces of text';
		const list = changed.length > 0 ? ': “' + changed.join('” and “') + '”.' : '.';
		return 'Markless changed ' + count + list + (drawn === '' ? '' : ' Drawn once is still ' + drawn + '.');
	});

	<PreviewCard name="state-pour" label="What a click changes">
		<Controls title="What changes when I click?">
			<Switch
				label="Button shows cups too"
				hint="Swaps in a version whose button label also reads cups: Pour cup {cups + 1}."
				onChange={(on: boolean) => {
					twice = on;
					last = '';
					changed = [];
				}}
			/>
		</Controls>
		<Stage>
			<Board>
				<LivePage art="mug">
					<div
						class="slot"
						hidden={twice}
						el={once}
						onPointerOver={() => watchText(once)}
						onFocusIn={() => watchText(once)}
						onClick={(event) => {
							const target = event.target;
							if (!(target instanceof Element) || !target.closest('button')) return;
							onceClicks++;
							last = 'click';
							afterUpdate(() => {
								const elements = takeTextChanges(once);
								changed = elements.map(textOf);
								drawn = drawnIn(once);
								markA = placeOverText(once, elements[0], lastNumber);
								markB = placeOverText(once, elements[1], lastNumber);
								if (changed.some((text) => text.startsWith('Drawn'))) onceDrawnChanges++;
							});
						}}
					>
						<Pour />
						<span class="mark" aria-hidden="true" hidden={last !== 'click' || markA === ''} style={markA}></span>
						<span class="mark" aria-hidden="true" hidden={last !== 'click' || markB === ''} style={markB}></span>
					</div>
					<div
						class="slot"
						hidden={!twice}
						el={both}
						onPointerOver={() => watchText(both)}
						onFocusIn={() => watchText(both)}
						onClick={(event) => {
							const target = event.target;
							if (!(target instanceof Element) || !target.closest('button')) return;
							twiceClicks++;
							last = 'click';
							afterUpdate(() => {
								const elements = takeTextChanges(both);
								changed = elements.map(textOf);
								drawn = drawnIn(both);
								markA = placeOverText(both, elements[0], lastNumber);
								markB = placeOverText(both, elements[1], lastNumber);
								if (changed.some((text) => text.startsWith('Drawn'))) twiceDrawnChanges++;
							});
						}}
					>
						<PourTwice />
						<span class="mark" aria-hidden="true" hidden={last !== 'click' || markA === ''} style={markA}></span>
						<span class="mark" aria-hidden="true" hidden={last !== 'click' || markB === ''} style={markB}></span>
					</div>
				</LivePage>
				<Ledger label="What ran and what changed">
					<Row name="{cups}">
						<span data-hot={last === 'click' ? 'true' : 'false'}>
							{cupsNote}
						</span>
					</Row>
					<div class="optional" hidden={!twice}>
						<Row name="{cups + 1}">
							<span data-hot={last === 'click' ? 'true' : 'false'}>
								{buttonNote}
							</span>
						</Row>
					</div>
					<Row name="{drawn}">
						<span>{drawnNote}</span>
					</Row>
					<Row name="cups++">
						<span>{ranNote}</span>
					</Row>
					<Row name="Pour()">
						<span>ran once, to set up</span>
					</Row>
				</Ledger>
			</Board>
		</Stage>
		<Watch>
			<span hidden={last !== 'click'}>
				The click ran <Mono>cups++</Mono>. {changedNote}
			</span>
			<span hidden={last !== ''}>
				<Mono>Pour()</Mono> ran once, to set up the page. A click runs only its handler.
			</span>
		</Watch>
		<div class="variant" hidden={twice}>
			<Code files={pour} />
		</div>
		<div class="variant" hidden={!twice}>
			<Code files={pourTwice} />
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
