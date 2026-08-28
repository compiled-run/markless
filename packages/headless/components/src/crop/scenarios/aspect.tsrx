import { crop } from '../../index.ts';


const AREA = 'position: relative; width: 400px; height: 300px; background: #eee';
const HANDLE = 'width: 12px; height: 12px; background: #111';
const START = { x: 20, y: 20, width: 160, height: 80 };

// A locked ratio, with the rule-of-thirds grid the family ships as an indicator.
export default function Aspect() @{
	<main>
		<crop.root
			data-testid="root"
			name="crop"
			defaultValue={START}
			aspect={2}
			minWidth={40}
			minHeight={20}
			maxWidth={320}
			maxHeight={160}
		>
			<crop.label data-testid="label">Banner</crop.label>
			<crop.area data-testid="area" style={AREA}>
				<crop.selection data-testid="selection">
					<crop.indicator data-testid="indicator" />
					<crop.thumb data-testid="handle-inline-end" inlineEnd style={HANDLE} />
					<crop.thumb data-testid="handle-block-end" blockEnd style={HANDLE} />
					<crop.thumb data-testid="handle-bottom-end" blockEnd inlineEnd style={HANDLE} />
				</crop.selection>
			</crop.area>
			<crop.field data-testid="field" />
		</crop.root>
	</main>
}
