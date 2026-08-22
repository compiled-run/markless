import { Display, Label, Root, Trigger } from './rpt-family.tsrx';

// Control for the repeat fixtures: the same widget family rendered ONCE, with no
// `@for` around it, so a dispatch failure can be attributed to the repeat.
export function App() @{
	<section data-rpt-page>
		<div data-row="r1">
			<Root checked={false} disabled={false} label="fixed">
				<Trigger />
				<Display />
				<Label />
			</Root>
		</div>
	</section>
}
