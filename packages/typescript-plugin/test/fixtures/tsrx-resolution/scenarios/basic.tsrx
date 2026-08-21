import { root as PanelRoot } from '../index.ts';

export function BasicPanel() @{
	<PanelRoot heading="Details" data-testid="root">
		<span>ok</span>
	</PanelRoot>
}

export default BasicPanel;
