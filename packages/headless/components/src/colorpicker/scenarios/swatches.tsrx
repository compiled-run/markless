import { colorpicker } from '../../index.ts';

const AREA = 'position: relative; width: 200px; height: 160px; touch-action: none';
const PALETTE = ['#3399FF', '#FF3366', '#33CC66'];

export default function Swatches() @{
	<colorpicker.root value="#3399ff" swatches={PALETTE} data-testid="root">
		<colorpicker.label data-testid="label">Brand colour</colorpicker.label>
		<colorpicker.content data-testid="content">
			<colorpicker.area data-testid="area" style={AREA}>
				<colorpicker.thumb data-testid="area-thumb" />
			</colorpicker.area>
		</colorpicker.content>
		<Palette />
		<colorpicker.valuelabel data-testid="valuelabel" />
	</colorpicker.root>
}

// The swatch row is the consumer's own markup, and it sits INSIDE the root: a
// component that reads the picker's state is a part of that picker's widget. A
// construct may not be the direct child of a component tag either, so the repeat
// opens in a plain element.
function Palette() @{
	const picker = colorpicker.state();

	<div data-testid="palette">
		@for (const swatch of picker.swatches; key swatch) {
			<colorpicker.item value={swatch} data-testid="swatch" />
		}
	</div>
}
