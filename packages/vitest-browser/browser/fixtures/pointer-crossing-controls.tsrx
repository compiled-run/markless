import { state } from '@markless/core';
import { toggle, tooltip } from '../../../headless/components/src/index.ts';

function Sample({ item, onPick }) @{
	<li data-sample={item.key} onClick={(event) => onPick(event.currentTarget.getAttribute('data-sample'))}>{item.label}</li>
}

// A docs-style playground: a controls row with a toggle and a tooltip side by
// side, each inside a plain wrapper with a bare span between them, over a keyed
// list whose rows are components. Only the tooltip root binds
// pointerover/pointerout; the component rows are what make the page forward
// every crossing nobody asked for.
export default function Controls() @{
	let picked = state('none');
	let samples = state([
		{ key: 'north', label: 'North' },
		{ key: 'south', label: 'South' },
	]);

	<section data-testid="controls" style="padding: 80px 40px">
		<div style="display: flex; gap: 24px; align-items: center">
			<div data-testid="toggle-wrap">
				<toggle.root>
					<toggle.label>Wrap lines</toggle.label>
					<toggle.trigger data-testid="toggle-trigger"><toggle.thumb /></toggle.trigger>
				</toggle.root>
			</div>
			<span data-testid="gap">between</span>
			<div data-testid="tooltip-wrap">
				<tooltip.root delay={0}>
					<tooltip.trigger data-testid="tooltip-trigger">Save</tooltip.trigger>
					<tooltip.content data-testid="tooltip-content">Save this draft</tooltip.content>
				</tooltip.root>
			</div>
		</div>
		<output data-testid="picked">{picked}</output>
		<ul>
			@for (const item of samples; key item.key) {
				<Sample item={item} onPick={(key) => picked = key} />
			}
		</ul>
	</section>
}
