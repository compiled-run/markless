import { state } from '@markless/core';
import { drawer } from '../../index.ts';

const PANEL = 'block-size: 320px; inline-size: 320px';

// A bottom sheet that rests half open before it rests fully open. The page
// renders what `onSnapPointChange` was called with, so what the DOM shows is what
// the consumer's callback actually received.
export default function Snapped() @{
	const log = state({ snap: '', calls: 0 });

	<section>
		<button type="button" data-testid="background">Background</button>
		<drawer.root
			data-testid="root"
			snapPoints={[0.5, 1]}
			defaultSnapPoint={0.5}
			onSnapPointChange={(next: number) => {
				log.snap = String(next);
				log.calls = log.calls + 1;
			}}
		>
			<drawer.trigger data-testid="trigger">Nearby stops</drawer.trigger>
			<drawer.backdrop data-testid="backdrop">
				<drawer.content data-testid="content">
					<div data-testid="panel" style={PANEL}>
						<drawer.title data-testid="title">Where to next?</drawer.title>
						<drawer.close data-testid="close">Done</drawer.close>
					</div>
				</drawer.content>
			</drawer.backdrop>
		</drawer.root>
		<p data-testid="snap">{log.snap}</p>
		<p data-testid="calls">{log.calls}</p>
	</section>
}
