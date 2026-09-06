import { drawer } from '@markless/ui';

const chip =
	'padding: 0.5em 0.9em; border: 2px solid var(--ink); border-radius: 6px; background: var(--paper); color: var(--ink); font: inherit; font-weight: 700; cursor: pointer;';
const sheet =
	'display: grid; gap: 0.5em; justify-items: start; padding: 1em 1.2em 1.4em; border-block-start: 2px solid var(--ink); border-start-start-radius: 10px; border-start-end-radius: 10px; background: var(--raised);';

export default function DeliverySheet() @{
	<drawer.root style="display: grid; justify-items: center;">
		<drawer.trigger style={chip}>Choose a delivery day</drawer.trigger>
		<drawer.backdrop style="background: rgb(0 0 0 / 0.45);">
			<drawer.content>
				<div style={sheet}>
					<drawer.title style="margin: 0; font-size: var(--step-0);">Delivery day</drawer.title>
					<drawer.description style="margin: 0; font-size: var(--step--1);">
						Swipe the sheet down to put it away, or press the button.
					</drawer.description>
					<drawer.close style={chip}>Thursday it is</drawer.close>
				</div>
			</drawer.content>
		</drawer.backdrop>
	</drawer.root>
}
