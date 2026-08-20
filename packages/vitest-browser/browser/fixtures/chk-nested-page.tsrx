import { Root, Trigger } from './chk.tsrx';
import { PanelLabel, PanelRoot } from './pnl.tsrx';

// The checkbox trigger is projected into a PANEL widget that is itself projected
// into the checkbox root, so each part must resolve its own family's seed.
export default function ChkNestedPage() @{
	<section data-nested-page>
		<Root disabled={true} name="outer">
			<PanelRoot tone="calm">
				<PanelLabel />
				<Trigger />
			</PanelRoot>
		</Root>
	</section>
}
