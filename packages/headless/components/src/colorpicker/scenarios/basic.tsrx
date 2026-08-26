import { colorpicker } from '../../index.ts';

// The starter a consumer copies. The plane and the rails are positioned and
// take their pointer behaviour from the family's own `@layer markless` defaults,
// so a scenario owes them nothing but a size.
const AREA = 'width: 200px; height: 160px';
const RAIL = 'width: 200px; height: 20px';

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
