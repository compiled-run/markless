import { colorpicker } from '../../index.ts';

const AREA = 'position: relative; width: 200px; height: 160px; touch-action: none';
const RAIL = 'position: relative; width: 200px; height: 20px; touch-action: none';

// One surface, both shapes: the markup inside `colorpicker.content` is the same
// as the inline starter's, and `popup` is what puts it behind the trigger.
export default function Popup() @{
	<colorpicker.root value="#3399ff" popup data-testid="root">
		<colorpicker.label data-testid="label">Brand colour</colorpicker.label>
		<colorpicker.trigger data-testid="trigger">Choose</colorpicker.trigger>
		<colorpicker.content data-testid="content">
			<colorpicker.area data-testid="area" style={AREA}>
				<colorpicker.thumb data-testid="area-thumb" />
			</colorpicker.area>
			<colorpicker.track channel="hue" data-testid="hue-track" style={RAIL}>
				<colorpicker.thumb channel="hue" data-testid="hue-thumb" />
			</colorpicker.track>
		</colorpicker.content>
		<colorpicker.valuelabel data-testid="valuelabel" />
	</colorpicker.root>
}
