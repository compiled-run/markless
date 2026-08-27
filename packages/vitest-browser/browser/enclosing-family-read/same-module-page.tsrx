import { Bar, BarItem } from './bar.tsrx';

// Axis 1, the baseline: registering parts declared in the family's OWN module.
export default function SameModulePage() @{
	<section data-same-module-page>
		<Bar label="only">
			<BarItem name="a" />
			<BarItem name="b" />
			<BarItem name="c" />
		</Bar>
	</section>
}
