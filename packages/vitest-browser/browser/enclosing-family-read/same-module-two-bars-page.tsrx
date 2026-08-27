import { Bar, BarItem } from './bar.tsrx';

// Axis 1 across two instances: the baseline for roster isolation.
export default function SameModuleTwoBarsPage() @{
	<section data-same-module-two-bars-page>
		<Bar label="left">
			<BarItem name="a" />
			<BarItem name="b" />
			<BarItem name="c" />
		</Bar>
		<Bar label="right">
			<BarItem name="d" />
			<BarItem name="e" />
		</Bar>
	</section>
}
