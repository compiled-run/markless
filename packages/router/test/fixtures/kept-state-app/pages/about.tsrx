import SideNavWide from '../src/side-nav-wide.tsrx';

export default function Page() @{
	<>
		<SideNavWide path="/about" />
		<main data-main="about">
			<h1 data-title>{'About page'}</h1>
			<p>{'The about page has its own content, which a navigation replaces.'}</p>
		</main>
	</>
}
