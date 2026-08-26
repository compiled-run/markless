import { colorpicker } from '../../index.ts';

const AREA = 'width: 200px; height: 160px';
const RAIL = 'width: 200px; height: 20px';

export default function TypedEntry() @{
	<colorpicker.root value="#3399ff" data-testid="root">
		<colorpicker.label data-testid="label">Brand colour</colorpicker.label>
		<colorpicker.content data-testid="content">
			<colorpicker.area data-testid="area" style={AREA}>
				<colorpicker.thumb data-testid="area-thumb" />
			</colorpicker.area>
			<colorpicker.track channel="hue" data-testid="hue-track" style={RAIL}>
				<colorpicker.thumb channel="hue" data-testid="hue-thumb" />
			</colorpicker.track>
		</colorpicker.content>
		<colorpicker.input data-testid="hex-input" />
		<colorpicker.input channel="red" data-testid="red-input" />
		<colorpicker.description data-testid="description">
			Six hex digits, with or without the hash.
		</colorpicker.description>
		<colorpicker.valuelabel data-testid="valuelabel" />
	</colorpicker.root>
}
