import { state } from '@markless/core';

export default function RorStyle() @{
	let accent = state('red');
	let swatches = state([{ code: 's1', width: '2px' }, { code: 's2', width: '3px' }]);
	<main>
		<button type="button" data-accent-blue onClick={() => (accent = 'blue')}>blue</button>
		<button type="button" data-add-swatch onClick={() => (swatches = [...swatches, { code: 's3', width: '4px' }])}>add</button>
		<ul>
			@for (const swatch of swatches; key swatch.code) {
				<li data-swatch={swatch.code} style={accent === 'red' ? 'color: red' : 'color: blue'}>
					<i data-bar={swatch.code} style={`border-color: ${accent}; width: ${swatch.width}`}>{swatch.code}</i>
				</li>
			}
		</ul>
		<style>
			li { margin: 0; }
		</style>
	</main>
}
