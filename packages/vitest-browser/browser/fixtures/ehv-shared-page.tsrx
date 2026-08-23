import { EhvSharedPanel, EhvSharedRoot, EhvSharedTrigger } from './ehv-shared.tsrx';

export default function EhvSharedPage() @{
	<section data-ehv-shared-page>
		<EhvSharedRoot>
			<EhvSharedPanel />
			<EhvSharedTrigger />
		</EhvSharedRoot>
	</section>
}
