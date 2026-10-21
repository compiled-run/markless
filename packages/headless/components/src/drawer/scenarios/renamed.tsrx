import { state } from '@markless/core';
import { drawer } from '../../index.ts';

// The title's text changes while the surface is open, and the name has to follow it.
export default function Renamed() @{
	const draft = state({ name: 'Narrow these results' });

	<section>
		<drawer.root data-testid="root">
			<drawer.trigger data-testid="trigger">Filter results</drawer.trigger>
			<drawer.backdrop data-testid="backdrop">
				<drawer.content data-testid="content">
					<div style="block-size: 320px; inline-size: 320px">
						<drawer.title data-testid="title">{draft.name}</drawer.title>
						<button
							type="button"
							data-testid="rename"
							onClick={() => {
								draft.name = 'Narrow these orders';
							}}
						>Rename</button>
						<drawer.close data-testid="close">Cancel</drawer.close>
					</div>
				</drawer.content>
			</drawer.backdrop>
		</drawer.root>
	</section>
}
