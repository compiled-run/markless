// The page-class readouts come from the live cards, so they show the class Markless really added.
import { computed, element, state } from '@markless/core';
import Illustration from '../../docs/illustration.tsrx';
import PreviewCard, { Choice, Controls, Mono, Stage, Switch, Watch } from '../../docs/preview-card.tsrx';
import ChalkTag from './chalk-tag.tsrx';
import PaperTag from './paper-tag.tsrx';

const added = (side: Element | undefined): string =>
	(side?.querySelector('.card')?.getAttribute('class') ?? '')
		.split(/\s+/)
		.filter((name) => name.startsWith('mk-'))
		.join(' ');

export default function StylingSketch() @{
	let lit = state(false);
	let size = state('small');
	let reveal = state(false);
	let last = state('');
	let paperAdded = state('');
	let chalkAdded = state('');
	let paperSide = element<HTMLDivElement>();
	let chalkSide = element<HTMLDivElement>();

	const restHidden = computed(() => !(last === '' || (last === 'reveal' && !reveal)));

	<PreviewCard name="styling" label="Two components that both style .card">
		<Controls title="Whose .card rule is this?">
			<Switch
				label="Chalk card lit"
				hint="Sets the chalk card's class to 'card lit'. Only chalk-tag.tsrx has a .lit rule."
				onChange={(on: boolean) => {
					lit = on;
					last = 'lit';
				}}
			/>
			<Choice
				label="Paper size"
				hint="Sets data-size on the paper card. paper-tag.tsrx styles [data-size='big']."
				options={['small', 'big']}
				value="small"
				onChange={(next: string) => {
					size = next;
					last = 'size';
				}}
			/>
			<Switch
				label="Show page classes"
				hint="Reads the class each card has on the page, including the one Markless adds per file."
				onChange={(on: boolean) => {
					reveal = on;
					last = 'reveal';
					paperAdded = added(paperSide);
					chalkAdded = added(chalkSide);
				}}
			/>
		</Controls>
		<Stage>
			<div class="pair">
				<div class="side" el={paperSide}>
					<p class="file"><Illustration name="paper-card" size="1.9em" />paper-tag.tsrx</p>
					<PaperTag size={size} />
					<p class="attr">
						<code class="cls">
							<span class="ln">
								{'class="card'}
								<span class="gap" hidden={!reveal || paperAdded === ''}><mark class="mk">{paperAdded}</mark></span>
								{'"'}
							</span>
							<span class="ln">
								data-size="
								<mark class={last === 'size' ? 'hit' : 'calm'}>{size}</mark>
								{'"'}
							</span>
						</code>
					</p>
				</div>
				<div class="side" el={chalkSide}>
					<p class="file"><Illustration name="chalk-card" size="1.9em" />chalk-tag.tsrx</p>
					<ChalkTag lit={lit} />
					<p class="attr">
						<code class="cls">
							<span class="ln">
							{'class="card'}
							<span class="gap" hidden={!lit}><mark class={last === 'lit' ? 'hit' : 'calm'}>lit</mark></span>
							<span class="gap" hidden={!reveal || chalkAdded === ''}><mark class="mk">{chalkAdded}</mark></span>
							{'"'}
							</span>
						</code>
					</p>
				</div>
			</div>
		</Stage>
		<Watch>
			<span hidden={last !== 'lit' || !lit}>
				The chalk card's class is now <Mono>card lit</Mono>. Only <Mono>chalk-tag.tsrx</Mono> has a{' '}
				<Mono>.lit</Mono> rule, so the paper card stays the same.
			</span>
			<span hidden={last !== 'lit' || lit}>
				The chalk card's class is back to <Mono>card</Mono>, and its own <Mono>.card</Mono> rule styles it again.
			</span>
			<span hidden={last !== 'size'}>
				The paper card's <Mono>data-size</Mono> is now {size}. Only its own file has a rule for
				that, so the chalk card stays the same.
			</span>
			<span hidden={last !== 'reveal' || !reveal}>
				On the page, each card also carries its file's class: <code class="id">{paperAdded}</code> and{' '}
				<code class="id">{chalkAdded}</code>. Each file's <Mono>.card</Mono> rule asks for its own.
			</span>
			<span hidden={restHidden}>
				Both cards say <Mono>class="card"</Mono>, and both files style <Mono>.card</Mono>. Each card keeps its
				own look.
			</span>
		</Watch>
		<style>
			.pair {
				display: grid;
				grid-template-columns: repeat(2, minmax(0, 1fr));
				gap: 2em;
				align-items: start;
				width: min(34rem, 100%);
			}

			.side {
				display: grid;
				gap: 0.7em;
				justify-items: center;
				text-align: center;
			}

			.file {
				display: inline-flex;
				align-items: center;
				gap: 0.5em;
			}

			.file,
			.attr {
				margin: 0;
				color: var(--ink);
				font-family: var(--font-mono);
				font-size: var(--step--1);
			}

			.id {
				padding: 0;
				background: none;
				color: inherit;
				font-family: var(--font-mono);
				font-size: 0.92em;
			}

			.cls {
				padding: 0;
				background: none;
				color: inherit;
				font-family: var(--font-mono);
				font-size: inherit;
			}

			.ln {
				display: block;
				font-family: var(--font-mono);
				white-space: nowrap;
			}

			.cls mark {
				padding: 0 0.1em;
				border-radius: 3px;
				color: inherit;
				font-family: var(--font-mono);
			}

			.cls .gap::before {
				content: ' ';
			}

			.cls .gap[hidden] {
				display: none;
			}

			.cls .calm {
				background: none;
			}

			.cls .hit,
			.cls .mk {
				background: var(--mark);
			}

			@media (max-width: 600px) {
				.pair {
					grid-template-columns: minmax(0, 1fr);
				}
			}
		</style>
	</PreviewCard>
}
