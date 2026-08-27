import { select, toggle, togglegroup } from '../../index.ts';
import * as toolbar from '../index.ts';

// The point of the family: four controls from four families sharing one tab stop,
// with no wrapper part around any of them. Each one registers itself by reading
// the enclosing `toolbar.state()`.
export default function Mixed() @{
	<toolbar.root data-testid="root">
		<toolbar.label data-testid="label">Document</toolbar.label>

		<togglegroup.root value="left" data-testid="align">
			<togglegroup.item value="left" data-testid="left">Left</togglegroup.item>
			<togglegroup.item value="center" data-testid="center">Center</togglegroup.item>
		</togglegroup.root>

		<toggle.root data-testid="wrap-root">
			<toggle.label data-testid="wrap-label">Wrap lines</toggle.label>
			<toggle.trigger data-testid="wrap"><toggle.thumb /></toggle.trigger>
		</toggle.root>

		<select.root data-testid="font-root">
			<select.label data-testid="font-label">Font</select.label>
			<select.trigger data-testid="font">Serif</select.trigger>
			<select.content data-testid="font-content">
				<select.item value="serif" data-testid="serif">
					<select.itemlabel>Serif</select.itemlabel>
				</select.item>
				<select.item value="mono" data-testid="mono">
					<select.itemlabel>Mono</select.itemlabel>
				</select.item>
			</select.content>
		</select.root>

		<toolbar.item data-testid="print">Print</toolbar.item>
	</toolbar.root>
}
