import Root from './projected-state-root.tsrx';
import Trigger from './projected-state-trigger.tsrx';

export default function ProjectedStatePairPage() @{
	<section data-projected-pair>
		<div data-pair="a">
			<Root>
				<Trigger />
			</Root>
		</div>
		<div data-pair="b">
			<Root>
				<Trigger />
			</Root>
		</div>
	</section>
}
