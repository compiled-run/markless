import { drawer } from '@markless/ui';

const chip =
	'padding: 0.5em 0.9em; border: 2px solid var(--ink); border-radius: 6px; background: var(--paper); color: var(--ink); font: inherit; font-weight: 700; cursor: pointer;';

export default function DeliverySheet() @{
	<drawer.root style="display: grid; justify-items: center;">
		<drawer.trigger style={chip}>Choose a delivery day</drawer.trigger>
		<drawer.backdrop class="backdrop">
			<drawer.content class="sheet">
				<drawer.title style="margin: 0; font-size: var(--step-0);">Delivery day</drawer.title>
				<drawer.description style="margin: 0; font-size: var(--step--1);">
					Drag the bar at the top down to put the sheet away, or press the button.
				</drawer.description>
				<drawer.close style={chip}>Thursday it is</drawer.close>
			</drawer.content>
		</drawer.backdrop>
		<style>
			.backdrop {
				z-index: 50;
				background: rgb(0 0 0 / 0.45);
			}

			.sheet {
				display: grid;
				gap: 0.5em;
				justify-items: start;
				padding: 0.4em 1.2em 1.4em;
				border-block-start: 2px solid var(--ink);
				border-start-start-radius: 10px;
				border-start-end-radius: 10px;
				background: var(--raised);
				cursor: grab;
			}

			/* A swipe starts only on the sheet element itself, so the grab bar is a pseudo-element, not a child. */
			.sheet::before {
				content: '';
				justify-self: center;
				inline-size: 3em;
				block-size: 0.35em;
				margin-block: 0.4em 0.6em;
				border-radius: 999px;
				background: var(--ink);
				opacity: 0.4;
			}
		</style>
	</drawer.root>
}
