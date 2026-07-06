import { state } from '@markless/core';
import { ProgressiveChildPanel } from './progressive-child-panel.tsrx';

export function App() @{
	let picked = state('none');
	let tools = state([
		{ slug: 'plane', title: 'Draft plane' },
		{ slug: 'loom', title: 'Trace loom' },
	]);

	<main class="progressive-shell">
		<ProgressiveChildPanel label={picked} />
		<section class="tool-strip">
			@for (const tool of tools; key tool.slug) {
				<article class="tool-card">
					<h3>{tool.title}</h3>
					<button type="button" data-row-pick onClick={() => picked = tool.slug}>Pick</button>
				</article>
			}
		</section>
		<output data-picked>{picked}</output>
	</main>
}
