import { tabs } from '../../../headless/components/src/index.ts';
import { session } from './session.ts';

type Pane = { readonly name: string; readonly tab: string; readonly lines: readonly { readonly id: string; readonly text: string }[] };

export default function Code({
	files,
	panes,
}: {
	readonly files: readonly { readonly name: string }[];
	readonly panes: readonly Pane[];
}) @{
	const first = panes[0]?.tab ?? '';

	<figure
		class="code-block"
		onPointerover={(event) => void session(event, files)}
		onFocusin={(event) => void session(event, files)}
	>
		<tabs.root value={first}>
			<div>
				<tabs.list aria-label="Files">
					<div role="presentation">
						@for (const pane of panes; key pane.name) {
							<tabs.trigger data-code-tab={pane.name} value={pane.tab}>{pane.name}</tabs.trigger>
						}
					</div>
				</tabs.list>
				<button type="button" onClick={(event) => void session(event, files)}>Reset</button>
			</div>
			@for (const pane of panes; key pane.name) {
				<tabs.content data-code-panel={pane.name} value={pane.tab}>
					<pre>
						@for (const line of pane.lines; key line.id) {
							<span>{line.text}</span>
						}
					</pre>
				</tabs.content>
			}
		</tabs.root>
	</figure>
}
