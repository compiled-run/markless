import { collapsible, lucide } from '@markless/ui';

export default function CollapsibleBasic() @{
	<collapsible.root class="collapsible" open>
		<collapsible.trigger class="trigger">
			<lucide.chevronright class="trigger-icon" aria-hidden="true" />
			What is a collapsible?
			<lucide.plus class="trigger-plus" aria-hidden="true" />
			<lucide.minus class="trigger-minus" aria-hidden="true" />
		</collapsible.trigger>
		<collapsible.content class="panel">
			A button that shows and hides the content below it. The panel stays in the page while it is
			closed, so find-in-page can still reach this text.
		</collapsible.content>

		<style>
			.collapsible {
				width: min(31rem, 100%);
				border: 1px solid var(--ink);
				border-radius: 6px;
				overflow: clip;
				font-family: 'Shantell Sans', system-ui, sans-serif;
				font-size: var(--step--1);
				line-height: 1.5;
			}

			.trigger {
				display: flex;
				gap: 0.75em;
				align-items: center;
				width: 100%;
				padding: 0.85em 1em;
				border: 0;
				background: transparent;
				color: var(--ink);
				font: inherit;
				font-family: 'Shantell Sans', system-ui, sans-serif;
				text-align: left;
				cursor: pointer;
			}

			.trigger-icon,
			.trigger-plus,
			.trigger-minus {
				display: inline-flex;
				width: 1em;
				height: 1em;
				flex: none;
				transition: transform 140ms ease;
			}

			.trigger[ui-open] .trigger-icon {
				transform: rotate(90deg);
			}

			.trigger-plus,
			.trigger-minus {
				margin-inline-start: auto;
			}

			.trigger-minus,
			.trigger[ui-open] .trigger-plus {
				display: none;
			}

			.trigger[ui-open] .trigger-minus {
				display: inline-flex;
			}

			.trigger[ui-open] {
				background: color-mix(in srgb, var(--purple) 26%, var(--paper));
			}

			.trigger:hover {
				background: color-mix(in srgb, var(--purple) 16%, var(--paper));
			}

			.trigger:focus-visible {
				outline: 2px solid var(--ink);
				outline-offset: -5px;
			}

			.trigger:disabled {
				cursor: not-allowed;
				opacity: 0.55;
			}

			.panel {
				color: var(--ink);
				font-family: 'Shantell Sans', system-ui, sans-serif;
			}

			/* Box styles wait for ui-open: a hidden="until-found" panel keeps its box for find-in-page. */
			.panel[ui-open] {
				padding: 1em;
				border-block-start: 1px solid var(--ink);
			}

			@media (prefers-reduced-motion: reduce) {
				.trigger-icon {
					transition: none;
				}
			}
		</style>
	</collapsible.root>;
}
