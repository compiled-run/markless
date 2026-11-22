import ElseArm from './else-arm.tsrx';
import Fight from './fight.tsrx';
import IfArm from './if-arm.tsrx';
import SwitchArm from './switch-arm.tsrx';
import TryArm from './try-arm.tsrx';

export default function ComposedPage() @{
	<main>
		<h1>Arms</h1>
		<div data-case="if"><IfArm /></div>
		<div data-case="else"><ElseArm /></div>
		<div data-case="switch"><SwitchArm /></div>
		<div data-case="fight"><Fight /></div>
		<div data-case="try"><TryArm /></div>
	</main>
}
