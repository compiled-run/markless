import { InstanceAltCounter } from './instance-alt-counter.tsrx';
import { InstanceCounter } from './instance-counter.tsrx';

export default function InstanceSameNamePage() @{
	<section data-same-name>
		<div data-row="a"><InstanceCounter /></div>
		<div data-row="b"><InstanceAltCounter /></div>
	</section>
}
