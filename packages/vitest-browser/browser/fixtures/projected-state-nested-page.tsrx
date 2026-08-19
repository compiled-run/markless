import Root from './projected-state-root.tsrx';
import Middle from './projected-state-middle.tsrx';
import Trigger from './projected-state-trigger.tsrx';

export default function ProjectedStateNestedPage() @{
	<section data-projected-nested>
		<Root>
			<Middle>
				<Trigger />
			</Middle>
		</Root>
	</section>
}
