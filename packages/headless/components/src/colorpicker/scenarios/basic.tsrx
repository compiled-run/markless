import { colorpicker } from '../../index.ts';

// The starter a consumer copies. The family ships no CSS, so every scenario gives
// the plane and the rails their own size, `position: relative` for the axis
// controls the area renders, and turns off touch scrolling.
const AREA = 'position: relative; width: 200px; height: 160px; touch-action: none';
const RAIL = 'position: relative; width: 200px; height: 20px; touch-action: none';

export default function Basic() @{
	<colorpicker.root value="#3399ff" name="brand" data-testid="root">
		<colorpicker.label data-testid="label">Brand colour</colorpicker.label>
		<colorpicker.content data-testid="content">
			<colorpicker.area data-testid="area" style={AREA}>
				<colorpicker.thumb data-testid="area-thumb" />
			</colorpicker.area>
			<colorpicker.track channel="hue" data-testid="hue-track" style={RAIL}>
				<colorpicker.thumb channel="hue" data-testid="hue-thumb" />
			</colorpicker.track>
		</colorpicker.content>
		<colorpicker.valuelabel data-testid="valuelabel" />
		<colorpicker.field data-testid="field" />
	</colorpicker.root>
}
