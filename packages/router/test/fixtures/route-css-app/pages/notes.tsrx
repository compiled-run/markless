import Nav from '../src/nav.tsrx';

export default function Page() @{
	<main>
		<title>Notes</title>
		<Nav />
		<h1 data-title>{'Notes'}</h1>
		<p>{'Notes is a page about one thing. It has a few short paragraphs so its client render has some weight to carry.'}</p>
		<p>{'A second paragraph about Notes, with a list below it.'}</p>
		<ul>
			<li>{'Notes one'}</li>
			<li>{'Notes two'}</li>
			<li>{'Notes three'}</li>
		</ul>
	</main>
}
