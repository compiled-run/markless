import Root from './projected-state-root.tsrx';
import Trigger from './projected-state-trigger.tsrx';

export default function ProjectedStatePage() @{
	<section data-projected-page>
		<Root>
			<Trigger />
		</Root>
	</section>
}
