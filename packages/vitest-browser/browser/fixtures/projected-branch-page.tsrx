import { Body, Handle, Note, Panel } from './projected-branch-panel.tsrx';

export default function PanelPage() @{
	<main data-panel-page>
		<Panel>
			<Handle />
			<Body>details</Body>
			<Note />
		</Panel>
	</main>
}
