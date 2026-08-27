import {
	PanelArea,
	PanelCombined,
	PanelMethodTrigger,
	PanelReadout,
	PanelRoot,
	PanelSelection,
} from './family/panel.tsrx';

export default function PanelPage() @{
	<section data-panel-page>
		<PanelRoot>
			<PanelArea>
				<PanelSelection />
			</PanelArea>
			<PanelReadout />
			<PanelCombined />
			<PanelMethodTrigger />
		</PanelRoot>
	</section>
}
