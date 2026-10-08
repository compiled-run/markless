// Which of @try, @pending and @catch is on the page, read from the live component itself.
import { computed, element, state } from '@markless/core';
import PreviewCard, { Choice, Controls, Mono, Stage, Watch } from '../../docs/preview-card.tsrx';
import BrowserFrame from '../../docs/browser-frame.tsrx';
import Illustration from '../../docs/illustration.tsrx';
import MugLookup from './mug-lookup.tsrx';
import { afterUpdate, watchChanges } from './place.ts';

const blockOn = (page: HTMLElement | undefined): string => {
	if (page?.querySelector('.wait')) return 'pending';
	if (page?.querySelector('.oops')) return 'catch';
	return 'try';
};

const shown = (page: HTMLElement | undefined): string =>
	(page?.querySelector('.answer, .wait, .oops')?.textContent ?? '').trim();

export default function AsyncSketch() @{
	let mug = state('');
	let phase = state('idle');
	let onPage = state('try');
	let held = state('');
	let heldBlock = state('try');
	let page = element<HTMLDivElement>();
	const tryOn = computed(() => (onPage !== 'try' ? 'false' : phase === 'waiting' ? 'held' : 'true'));
	const pendingOn = computed(() => (onPage === 'pending' ? 'true' : 'false'));
	const catchOn = computed(() => (onPage !== 'catch' ? 'false' : phase === 'waiting' ? 'held' : 'true'));

	<PreviewCard name="async" label="Which async block is on the page">
		<Controls title="Which block is on the page?">
			<Choice
				label="Mug"
				hint="Picking a mug runs the async recipe again. The cracked mug is not on the shelf, so its lookup fails."
				options={['tall', 'small', 'cracked']}
				value=""
				onChange={(next: string) => {
					const read = () => {
						const block = blockOn(page);
						onPage = block;
						if (phase !== 'waiting' && phase !== 'pending') return;
						if (block === 'pending') phase = 'pending';
						else if (block === heldBlock && shown(page) === held) return;
						else phase = block === 'catch' ? 'failed' : 'arrived';
					};
					held = shown(page);
					heldBlock = blockOn(page);
					phase = 'waiting';
					mug = next;
					watchChanges(page, read);
					afterUpdate(read);
				}}
			/>
		</Controls>
		<Stage>
			<div class="split">
				<div class="window">
					<BrowserFrame address="my-app.dev">
						<div class="page" el={page}>
							<MugLookup mug={mug} />
							<p class="held" hidden={phase !== 'waiting'}>kept while waiting</p>
						</div>
					</BrowserFrame>
					<span class="art" data-mug={mug}>
						<span class="pick small"><Illustration name="mug" size="2.9rem" spot="corner" /></span>
						<span class="pick tall"><Illustration name="mug-tall" size="2.9rem" spot="corner" /></span>
						<span class="pick cracked"><Illustration name="mug-cracked" size="2.9rem" spot="corner" /></span>
					</span>
				</div>
				<ol class="blocks" aria-label="Async blocks">
					<li class="block" data-on={tryOn}>
						<code>{'@try'}</code>
						<span>the answer</span>
					</li>
					<li class="block" data-on={pendingOn}>
						<code>{'@pending'}</code>
						<span>before any answer</span>
					</li>
					<li class="block" data-on={catchOn}>
						<code>{'@catch'}</code>
						<span>a failure</span>
					</li>
				</ol>
			</div>
		</Stage>
		<Watch>
			<span hidden={phase !== 'idle'}>Pick a mug. Then pick another while its answer is on the page.</span>
			<span hidden={phase !== 'waiting'}>
				Looking up the {mug} mug. The old block stays on the page until the new answer is ready.
			</span>
			<span hidden={phase !== 'pending'}>
				There is no answer yet, so <Mono>{'@pending'}</Mono> shows.
			</span>
			<span hidden={phase !== 'arrived'}>
				The {mug} answer is ready, and <Mono>{'@try'}</Mono> swaps it in.
			</span>
			<span hidden={phase !== 'failed'}>
				The lookup failed, so <Mono>{'@catch'}</Mono> takes over. Pick another mug to recover.
			</span>
		</Watch>
		<style>
			.split {
				display: grid;
				grid-template-columns: minmax(0, 1fr) minmax(0, 1.3fr);
				gap: 1.5em;
				align-items: stretch;
				width: min(38rem, 100%);
			}

			.window {
				position: relative;
				display: grid;
				min-width: 0;
			}

			.page {
				display: grid;
				gap: 0.5em;
				align-content: start;
				box-sizing: border-box;
				padding: 0.85em 1em 1em;
			}

			.pick {
				display: contents;
			}

			.art:not([data-mug='tall']) .tall,
			.art:not([data-mug='cracked']) .cracked,
			.art:is([data-mug='tall'], [data-mug='cracked']) .small {
				display: none;
			}

			.held {
				margin: 0;
				color: var(--muted-ink);
				font-size: var(--step--1);
			}

			.held {
				justify-self: start;
				padding: 0 0.4em;
				border-radius: 3px;
				background: var(--mark);
				color: var(--ink);
			}

			.held[hidden] {
				display: none;
			}

			.blocks {
				display: grid;
				gap: 0.7em;
				margin: 0;
				padding: 0;
				list-style: none;
			}

			.block {
				display: flex;
				flex-wrap: wrap;
				gap: 0.2em 0.8em;
				align-items: baseline;
				padding: 0.6em 1em;
				border: 1px solid var(--ink);
				border-radius: 6px;
				background: var(--paper);
				color: var(--ink);
				transition: background 140ms ease;
			}

			.block:is([data-on='true'], [data-on='held']) {
				background: color-mix(in srgb, var(--purple) 26%, var(--paper));
			}

			.block:is([data-on='true'], [data-on='held'])::after {
				content: 'on the page';
				margin-inline-start: auto;
				font-size: var(--step--1);
			}

			.block[data-on='held']::after {
				content: 'still showing';
			}

			.block code {
				padding: 0;
				background: none;
				color: inherit;
				font-family: var(--font-mono);
				font-size: var(--step--1);
				font-weight: 700;
			}

			.block span {
				font-size: var(--step--1);
			}

			@media (max-width: 600px) {
				.split {
					grid-template-columns: minmax(0, 1fr);
				}
			}

			@media (prefers-reduced-motion: reduce) {
				.block {
					transition: none;
				}
			}
		</style>
	</PreviewCard>
}
