import { Arm, Root, Trigger } from './shared-branch-resume.tsrx';

export default function GatePage() @{
	<section data-gate-page>
		<Root>
			<Trigger />
			<Arm>open</Arm>
		</Root>
	</section>
}
