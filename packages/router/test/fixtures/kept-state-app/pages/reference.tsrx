import Banner from '../src/banner.tsrx';
import SideNav from '../src/side-nav.tsrx';
import PressCounter from '../src/press-counter.tsrx';

export default function Page() @{
	<>
		<Banner />
		<SideNav path="/reference" />
		<main data-main="reference">
			<h1 data-title>{'Reference page'}</h1>
			<p>{'The reference page has its own content, which a navigation replaces.'}</p>
			<p>{'The reference page has one more paragraph than the guide page.'}</p>
		</main>
		<PressCounter />
	</>
}
