import { drawer } from '../../index.ts';

const PANEL = 'block-size: 320px; inline-size: 320px';

// The title stays the name by reference; the plain-text aria-label is what VoiceOver speaks when the dialog is not directly under <main>.
export default function Labelled() @{
	<section>
		<drawer.root data-testid="root">
			<drawer.trigger data-testid="trigger">Filter results</drawer.trigger>
			<drawer.backdrop data-testid="backdrop">
				<drawer.content aria-label="Narrow these results" data-testid="content">
					<div style={PANEL}>
						<drawer.title data-testid="title">Narrow these results</drawer.title>
						<drawer.close data-testid="close">Cancel</drawer.close>
					</div>
				</drawer.content>
			</drawer.backdrop>
		</drawer.root>
	</section>
}
