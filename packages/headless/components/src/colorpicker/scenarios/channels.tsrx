import { colorpicker } from '../../index.ts';

const RAIL = 'position: relative; width: 200px; height: 20px; touch-action: none';

// Every channel the family names, each on its own rail. The track and the thumb
// behave identically whichever channel they carry - `channel` says which number
// this instance holds, it does not fork the part.
export default function Channels() @{
	<colorpicker.root value="#3399ff" data-testid="root">
		<colorpicker.label data-testid="label">Brand colour</colorpicker.label>
		<colorpicker.content data-testid="content">
			<colorpicker.track channel="hue" data-testid="hue-track" style={RAIL}>
				<colorpicker.thumb channel="hue" data-testid="hue-thumb" />
			</colorpicker.track>
			<colorpicker.track channel="saturation" data-testid="saturation-track" style={RAIL}>
				<colorpicker.thumb channel="saturation" data-testid="saturation-thumb" />
			</colorpicker.track>
			<colorpicker.track channel="brightness" data-testid="brightness-track" style={RAIL}>
				<colorpicker.thumb channel="brightness" data-testid="brightness-thumb" />
			</colorpicker.track>
			<colorpicker.track channel="lightness" data-testid="lightness-track" style={RAIL}>
				<colorpicker.thumb channel="lightness" data-testid="lightness-thumb" />
			</colorpicker.track>
			<colorpicker.track channel="red" data-testid="red-track" style={RAIL}>
				<colorpicker.thumb channel="red" data-testid="red-thumb" />
			</colorpicker.track>
			<colorpicker.track channel="green" data-testid="green-track" style={RAIL}>
				<colorpicker.thumb channel="green" data-testid="green-thumb" />
			</colorpicker.track>
			<colorpicker.track channel="blue" data-testid="blue-track" style={RAIL}>
				<colorpicker.thumb channel="blue" data-testid="blue-thumb" />
			</colorpicker.track>
		</colorpicker.content>
		<colorpicker.valuelabel data-testid="valuelabel" />
	</colorpicker.root>
}
