import { colorpicker } from '../../index.ts';

const AREA = 'width: 200px; height: 160px';
const RAIL = 'width: 200px; height: 20px';

// `alpha` is HTML's own spelling, taken from `<input type="color" alpha>`.
export default function Alpha() @{
	<colorpicker.root value="rgba(51, 153, 255, 0.5)" alpha name="tint" data-testid="root">
		<colorpicker.label data-testid="label">Overlay tint</colorpicker.label>
		<colorpicker.content data-testid="content">
			<colorpicker.area data-testid="area" style={AREA}>
				<colorpicker.thumb data-testid="area-thumb" />
			</colorpicker.area>
			<colorpicker.track channel="hue" data-testid="hue-track" style={RAIL}>
				<colorpicker.thumb channel="hue" data-testid="hue-thumb" />
			</colorpicker.track>
			<colorpicker.track channel="alpha" data-testid="alpha-track" style={RAIL}>
				<colorpicker.thumb channel="alpha" data-testid="alpha-thumb" />
			</colorpicker.track>
		</colorpicker.content>
		<colorpicker.valuelabel data-testid="valuelabel" />
		<colorpicker.field data-testid="field" />
	</colorpicker.root>
}
