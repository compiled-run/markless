import NestedArmState from './nested-arm-state.tsrx';
import NestedIf from './nested-if.tsrx';
import NestedSwitch from './nested-switch.tsrx';

export default function ComposedNestedPage() @{
	<main>
		<h1>Nested</h1>
		<div data-case="nested-if"><NestedIf /></div>
		<div data-case="nested-switch"><NestedSwitch /></div>
		<div data-case="nested-arm-state"><NestedArmState /></div>
	</main>
}
