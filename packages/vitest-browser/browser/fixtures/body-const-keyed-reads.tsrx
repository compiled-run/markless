import { state } from '@markless/core';

const TONES: Record<string, { readonly swatch: string }> = {
	pie: { swatch: 'tone-warm' },
	radial: { swatch: 'tone-cool' },
};

export default function BodyConstKeyedReads() @{
	const chartClasses: Record<string, string> = { pie: 'chart-pie', radial: 'chart-radial' };
	const legends: Record<string, { readonly caption: string }> = {
		pie: { caption: 'Slices' },
		radial: { caption: 'Rings' },
	};
	const steps = ['first', 'second', 'third'];
	const grid: Record<string, ReadonlyArray<string>> = { pie: ['p0', 'p1'], radial: ['r0', 'r1'] };
	let chart = state('pie');
	let step = state(0);

	<section>
		<div data-chart class={chartClasses[chart]} title={legends[chart].caption}>{grid[chart][step]}</div>
		<span data-step class={steps[step] + ' step'}>{steps[step]}</span>
		<i data-tone class={TONES[chart].swatch} />
		<button type="button" data-flip onClick={() => (chart = chart === 'pie' ? 'radial' : 'pie')}>flip</button>
		<button type="button" data-next onClick={() => (step = step + 1)}>next</button>
	</section>
}
