import { state } from '@markless/core';

const config = { ids: [2], label: 'picked' };

function Pick({ config, picked }: { config: { ids: number[]; label: string }; picked: number }) @{
	<p>
		@if (config.ids.includes(picked)) {
			<span data-open>{config.label}</span>
		}
	</p>
}

export default function Page() @{
	let picked = state(1);

	<section>
		<button data-next onClick={() => picked++}>Next</button>
		<Pick config={config} picked={picked} />
		<Pick config={{ ids: [3], label: 'inline' }} picked={picked} />
	</section>
}
