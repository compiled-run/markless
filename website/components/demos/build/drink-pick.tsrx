import { storage } from '@markless/core';
import { lucide } from '@markless/ui';
import Illustration from '../../docs/illustration.tsrx';
import PreviewCard, { Action, Controls, Mono, Stage, Watch } from '../../docs/preview-card.tsrx';
import Code from '../../docs/preview-card/code.tsrx';
import { drinkPick } from './code-panes.ts';

// The page imports this file directly: storage seeds reach only components the page imports itself.
export default function DrinkPick() @{
	// oxlint-disable-next-line no-unused-vars -- the write persists the choice
	let drink = storage('docs-drink', 'tea');

	<PreviewCard name="drink-pick" label="storage()">
		<Controls title="Pick a drink, then reload">
			<Action end onClick={() => location.reload()}>
				<lucide.rotateccw class="icon" aria-hidden="true" />
				Reload page
			</Action>
		</Controls>
		<Stage>
			<div class="drinks" role="group" aria-labelledby="docs-drink-label">
				<p class="caption" id="docs-drink-label">Your drink</p>
				<button class="tea" onClick={() => (drink = 'tea')}><Illustration name="tea" size="2.6em" />Tea</button>
				<button class="coffee" onClick={() => (drink = 'coffee')}><Illustration name="mug" size="2.6em" />Coffee</button>
				<button class="cocoa" onClick={() => (drink = 'cocoa')}><Illustration name="cocoa" size="2.6em" />Cocoa</button>
			</div>
		</Stage>
		<Watch>
			<span class="lines">
				<Mono>
					{'drink = "'}<mark class="tea">tea</mark><mark class="coffee">coffee</mark><mark class="cocoa">cocoa</mark>{'"'}
				</Mono>
				<Mono>
					{'<html data-docs-drink="'}<mark class="tea">tea</mark><mark class="coffee">coffee</mark><mark class="cocoa">cocoa</mark>{'">'}
				</Mono>
			</span>
		</Watch>
		<Code files={drinkPick} />
		<style>
			.drinks {
				display: grid;
				grid-template-columns: repeat(3, 1fr);
				gap: 0.7em;
				width: min(26rem, 100%);
			}

			.caption {
				grid-column: 1 / -1;
				margin: 0 0 0.2em;
				color: var(--ink);
				font-family: 'Shantell Sans', system-ui, sans-serif;
				font-size: var(--step--1);
				text-align: center;
			}

			button {
				display: grid;
				justify-items: center;
				gap: 0.3em;
				padding: 0.6em 1em;
				border: 1px solid var(--ink);
				border-radius: 6px;
				background: var(--paper);
				color: var(--ink);
				font-family: 'Shantell Sans', system-ui, sans-serif;
				font-size: var(--step-0);
				cursor: pointer;
				transition: background 140ms ease;
			}

			button:hover {
				background: color-mix(in srgb, var(--purple) 16%, var(--paper));
			}

			button:focus-visible {
				outline: 2px solid var(--ink);
				outline-offset: 4px;
			}

			button.tea {
				html[data-docs-drink='tea'] & {
					background: color-mix(in srgb, var(--purple) 26%, var(--paper));
				}
			}

			button.coffee {
				html[data-docs-drink='coffee'] & {
					background: color-mix(in srgb, var(--purple) 26%, var(--paper));
				}
			}

			button.cocoa {
				html[data-docs-drink='cocoa'] & {
					background: color-mix(in srgb, var(--purple) 26%, var(--paper));
				}
			}

			.lines {
				display: grid;
				gap: 0.2em;
			}

			mark {
				display: none;
				padding: 0 0.15em;
				border-radius: 3px;
				background: var(--mark);
				color: inherit;
				font-weight: 700;
			}

			mark.tea {
				html[data-docs-drink='tea'] & {
					display: inline;
				}
			}

			mark.coffee {
				html[data-docs-drink='coffee'] & {
					display: inline;
				}
			}

			mark.cocoa {
				html[data-docs-drink='cocoa'] & {
					display: inline;
				}
			}

			.icon {
				width: 1em;
				height: 1em;
			}

			@media (prefers-reduced-motion: reduce) {
				button {
					transition: none;
				}
			}
		</style>
	</PreviewCard>
}
