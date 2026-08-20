import { InstanceCollisionPart } from './instance-collision-part.tsrx';
import { InstanceCollisionRoot } from './instance-collision-root.tsrx';

export default function InstanceCollisionPage() @{
	<section data-collision-page>
		<InstanceCollisionRoot>
			<InstanceCollisionPart />
		</InstanceCollisionRoot>
	</section>
}
