import SideNav from '../src/side-nav.tsrx';
import PressCounter from '../src/press-counter.tsrx';

export default function Page() @{
	<>
		<SideNav path="/guide" />
		<main data-main="guide">
			<h1 data-title>{'Guide page'}</h1>
			<p>{'The guide page has its own content, which a navigation replaces.'}</p>
		</main>
		<PressCounter />
	</>
}
