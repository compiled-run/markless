import { Root, Trigger } from '../fixtures/sel.tsrx';
import { RemoteContent } from './remote-content.tsrx';

export default function SubtreePage() @{
	<section>
		<div data-widget="a">
			<Root>
				<Trigger />
				<RemoteContent />
			</Root>
		</div>
		<div data-widget="b">
			<Root>
				<Trigger />
				<RemoteContent />
			</Root>
		</div>
	</section>
}
