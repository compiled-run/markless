import { WsfRoot, WsfTrigger } from './wsf-group.tsrx';

// Two sibling groups: a write on one group must move only the widget that group
// composed.
export default function WsfPage() @{
	<section data-wsf-page>
		<WsfRoot>
			<WsfTrigger />
		</WsfRoot>
		<WsfRoot>
			<WsfTrigger />
		</WsfRoot>
	</section>
}
