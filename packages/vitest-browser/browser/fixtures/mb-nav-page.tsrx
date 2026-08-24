import { MbNavLink, MbNavProbe, MbNavRoot, MbNavTrigger } from './mb-nav.tsrx';

export default function MbNavPage() @{
	<section data-mb-nav-page>
		<MbNavRoot>
			<MbNavTrigger />
			<MbNavLink />
			<MbNavProbe />
		</MbNavRoot>
	</section>
}
