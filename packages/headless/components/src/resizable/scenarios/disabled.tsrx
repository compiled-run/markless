import { state } from '@markless/core';
import { resizable } from '../../index.ts';

// Nothing resizes, the divider is out of the tab order, and no callback ever runs.
export default function Disabled() @{
	let calls = state(0);

	<section>
		<resizable.root
			disabled={true}
			defaultSizes={{ nav: 30, main: 70 }}
			data-testid="root"
			style="inline-size: 400px; block-size: 120px"
			onChange={() => {
				calls = calls + 1;
			}}
		>
			<resizable.item value="nav" data-testid="nav">Navigation</resizable.item>
			<resizable.thumb
				value="nav"
				min={10}
				max={80}
				aria-label="Resize navigation"
				data-testid="thumb"
				style="inline-size: 8px; background: #ccc"
			/>
			<resizable.item value="main" data-testid="main">Content</resizable.item>
		</resizable.root>
		<output data-testid="calls">{calls}</output>
	</section>
}
