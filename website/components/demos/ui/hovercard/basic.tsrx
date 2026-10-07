import { hovercard } from '@markless/ui';

export default function HovercardBasic() @{
	<div class="line">
		<span>Before this page, read</span>
		<hovercard.root class="mention">
			<hovercard.trigger class="link" href="/ui/accordion">the accordion page</hovercard.trigger>
			<hovercard.content class="card">
				<span class="card-name">accordion</span>
				<span class="card-note">Stacked sections. Each heading opens its own panel.</span>
				<a class="link" href="/ui/accordion">Read it</a>
			</hovercard.content>
		</hovercard.root>

		<style>
			.line {
				display: grid;
				gap: 0.2em;
				justify-items: center;
				padding-block-end: 8.5em;
				font-family: 'Shantell Sans', system-ui, sans-serif;
				font-size: var(--step--1);
				line-height: 1.5;
				color: var(--ink);
			}

			.link {
				border-radius: 4px;
				color: var(--ink);
				font-family: 'Shantell Sans', system-ui, sans-serif;
				text-decoration: underline;
				text-decoration-color: var(--pink);
				text-decoration-thickness: 2px;
				text-underline-offset: 0.2em;
			}

			.link:hover {
				background: color-mix(in srgb, var(--purple) 16%, var(--paper));
			}

			.link:focus-visible {
				outline: 2px solid var(--ink);
				outline-offset: 3px;
			}

			.card {
				z-index: 5;
				display: grid;
				gap: 0.35em;
				box-sizing: border-box;
				width: min(17rem, calc(100vw - 4rem));
				margin-block-start: 0.6em;
				padding: 0.9em 1em;
				border: 1px solid var(--ink);
				border-radius: 6px;
				background: var(--raised);
				box-shadow: 3px 3px 0 color-mix(in srgb, var(--purple) 45%, var(--paper));
				text-align: left;
			}

			.card[hidden] {
				display: none;
			}

			.card-name {
				font-family: 'Joy Elia', system-ui, sans-serif;
				font-size: var(--step-0);
			}

			.card-note {
				font-family: 'Shantell Sans', system-ui, sans-serif;
			}
		</style>
	</div>;
}
