import { progress } from '../../index.ts';

// One embed's worth of page, mounted twice as two islands. A display family has no
// gesture of its own, so the embed carries the write a consumer would make. Advance
// sits inside the root, where the widget scope is meant to hand it this bar rather
// than a new one — a prop cannot do that job, because the root seeds its cell from
// `value` once and a later prop change never reaches it.
export default function MultiEmbed() @{
	<section data-testid="frame">
		<progress.root value={30} data-testid="root">
			<progress.label data-testid="label">Export data</progress.label>
			<progress.valuelabel data-testid="valuelabel" />
			<progress.track data-testid="track">
				<progress.indicator data-testid="indicator" />
			</progress.track>
			<Advance />
		</progress.root>
	</section>
}

function Advance() @{
	const bar = progress.state();

	<button
		type="button"
		data-testid="advance"
		onClick={() => {
			bar.value = 70;
		}}
	>Advance</button>
}
