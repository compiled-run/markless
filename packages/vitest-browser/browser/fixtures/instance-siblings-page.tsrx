import { InstanceCounter } from './instance-counter.tsrx';

export default function InstanceSiblingsPage() @{
	<section data-two-instances>
		<div data-row="a"><InstanceCounter /></div>
		<div data-row="b"><InstanceCounter /></div>
	</section>
}
