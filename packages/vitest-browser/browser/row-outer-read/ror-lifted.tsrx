import { state } from '@markless/core';

export default function RorLifted() @{
	let accent = state('red');
	let swatches = state([{ code: 's1' }, { code: 's2' }]);
	<main>
		<button type="button" data-accent-blue onClick={() => (accent = 'blue')}>blue</button>
		<button type="button" data-add-swatch onClick={() => (swatches = [...swatches, { code: 's3' }])}>add</button>
		<ul>
			@for (const swatch of swatches; key swatch.code) {
				<li data-swatch={swatch.code} title={accent === 'red' ? 'warm' : 'cool'}>{accent.toUpperCase()}</li>
			}
		</ul>
	</main>
}
