import { state } from '@markless/core';
import { CounterArm } from './counter-arm.tsrx';
import { SceneArm } from './scene-arm.tsrx';

export function BranchImportedArmsPage() @{
	let view = state('none');
	let seed = state(3);
	let bumps = state(0);
	let label = state('tag');

	<main>
		<output data-bumps>{bumps}</output>
		<button type="button" data-show-counter onClick={() => (view = 'counter')}>Counter</button>
		<button type="button" data-show-scene onClick={() => (view = 'scene')}>Scene</button>
		<button type="button" data-show-none onClick={() => (view = 'none')}>None</button>
		<button type="button" data-seed onClick={() => (seed = seed + 1)}>Seed</button>
		<button type="button" data-relabel onClick={() => (label = label + '!')}>Relabel</button>
		<section data-switch>
			@switch (view) {
				@case 'counter': {
					<CounterArm label={label} onBump={() => (bumps = bumps + 1)} />
				}
				@case 'scene': {
					<SceneArm seed={seed} />
				}
				@default: {
					<p data-empty>nothing shown</p>
				}
			}
		</section>
	</main>
}

