import { state } from '@markless/core';
import { colorpicker } from '../../index.ts';

const AREA = 'width: 200px; height: 160px';
const RAIL = 'width: 200px; height: 20px';

// Both callbacks reported into the page: `onChange` fires at every step of a
// gesture, `onChangeEnd` once it settles.
export default function Controlled() @{
	let changed = state('');
	let settled = state('');
	let calls = state(0);

	<div>
		<colorpicker.root
			value="#3399ff"
			data-testid="root"
			onChange={(next) => {
				changed = next;
				calls = calls + 1;
			}}
			onChangeEnd={(next) => {
				settled = next;
			}}
		>
			<colorpicker.label data-testid="label">Brand colour</colorpicker.label>
			<colorpicker.content data-testid="content">
				<colorpicker.area data-testid="area" style={AREA}>
					<colorpicker.thumb data-testid="area-thumb" />
				</colorpicker.area>
				<colorpicker.track channel="hue" data-testid="hue-track" style={RAIL}>
					<colorpicker.thumb channel="hue" data-testid="hue-thumb" />
				</colorpicker.track>
			</colorpicker.content>
		</colorpicker.root>
		<output data-testid="changed">{changed}</output>
		<output data-testid="settled">{settled}</output>
		<output data-testid="calls">{calls}</output>
	</div>
}
