import { state } from '@markless/core';
import Illustration from '../../docs/illustration.tsrx';
import PreviewCard, { Choice, Controls, Mono, Stage, Watch } from '../../docs/preview-card.tsrx';
import Code from '../../docs/preview-card/code.tsrx';
import { talliesPage, talliesWidget } from './code-panes.ts';
import TalliesPage from './tallies-page.tsrx';
import TalliesWidget from './tallies-widget.tsrx';

export default function TalliesDemo() @{
	let scope = state('app');

	<PreviewCard name="tallies" label="shared() scope">
		<Controls title="Who shares one copy?">
			<Choice
				label="Scope"
				hint="The second argument to shared(). 'app' gives the page one copy. 'subtree' gives each Tally its own."
				options={['app', 'subtree']}
				value="app"
				onChange={(next: string) => (scope = next)}
			/>
		</Controls>
		<Stage>
			<div class="pin">
				<div class="variant" hidden={scope !== 'app'}>
					<TalliesPage />
				</div>
				<div class="variant" hidden={scope !== 'subtree'}>
					<TalliesWidget />
				</div>
				<Illustration name="tally-counter" size="3.4rem" spot="corner" />
			</div>
		</Stage>
		<Watch>
			<span hidden={scope !== 'app'}>
				<Mono>{"{ scope: 'app' }"}</Mono>: both Tallies call <Mono>tally()</Mono> and get one copy, so
				either button moves both numbers.
			</span>
			<span hidden={scope !== 'subtree'}>
				<Mono>{"{ scope: 'subtree' }"}</Mono>: each Tally starts its own copy. Its Badge reads that
				copy, and the other number stays put.
			</span>
		</Watch>
		<div class="variant" hidden={scope !== 'app'}>
			<Code files={talliesPage} />
		</div>
		<div class="variant" hidden={scope !== 'subtree'}>
			<Code files={talliesWidget} />
		</div>
		<style>
			.pin {
				position: relative;
				display: grid;
			}

			.variant[hidden] {
				display: none;
			}

			div.variant {
				display: contents;
			}
		</style>
	</PreviewCard>
}
