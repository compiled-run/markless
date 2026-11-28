import Nav from '../src/nav.tsrx';

export default function Page() @{
	<main>
		<title>Garden</title>
		<Nav />
		<h1 data-title>{'Garden'}</h1>
		<p>{'Garden is a page about one thing. It has a few short paragraphs so its client render has some weight to carry.'}</p>
		<p>{'A second paragraph about Garden, with a list below it.'}</p>
		<ul>
			<li>{'Garden one'}</li>
			<li>{'Garden two'}</li>
			<li>{'Garden three'}</li>
		</ul>
	</main>
}
