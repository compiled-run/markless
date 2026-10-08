import { state } from '@markless/core';
import Illustration from '../../docs/illustration.tsrx';
import PreviewCard, { Choice, Controls, Mono, Stage, Watch } from '../../docs/preview-card.tsrx';
import Code from '../../docs/preview-card/code.tsrx';
import { talliesPage, talliesWidget } from './code-panes.ts';
import TalliesPage from './tallies-page.tsrx';
import TalliesWidget from './tallies-widget.tsrx';

export default function TalliesDemo() @{
	let scope = state('page');

	<PreviewCard name="tallies" label="shared() scope">
		<Controls title="Who shares one copy?">
			<Choice
				label="Scope"
				hint="The second argument to shared(). 'page' gives the page one copy. 'widget' gives each Tally its own."
				options={['page', 'widget']}
				value="page"
				onChange={(next: string) => (scope = next)}
			/>
		</Controls>
		<Stage>
			<div class="pin">
				<div class="variant" hidden={scope !== 'page'}>
					<TalliesPage />
				</div>
				<div class="variant" hidden={scope !== 'widget'}>
					<TalliesWidget />
				</div>
				<Illustration name="tally-counter" size="3.4rem" spot="corner" />
			</div>
		</Stage>
		<Watch>
			<span hidden={scope !== 'page'}>
				<Mono>{"{ scope: 'page' }"}</Mono>: both Tallies call <Mono>tally()</Mono> and get one copy, so
				either button moves both numbers.
			</span>
			<span hidden={scope !== 'widget'}>
				<Mono>{"{ scope: 'widget' }"}</Mono>: each Tally starts its own copy. Its Badge reads that
				copy, and the other number stays put.
			</span>
		</Watch>
		<div class="variant" hidden={scope !== 'page'}>
			<Code files={talliesPage} />
		</div>
		<div class="variant" hidden={scope !== 'widget'}>
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
