import Nav from '../src/nav.tsrx';

export default function Page() @{
	<main>
		<title>Home</title>
		<Nav />
		<h1 data-title>{'Home'}</h1>
		<p>{'Home is a page about one thing. It has a few short paragraphs so its client render has some weight to carry.'}</p>
		<p>{'A second paragraph about Home, with a list below it.'}</p>
		<ul>
			<li>{'Home one'}</li>
			<li>{'Home two'}</li>
			<li>{'Home three'}</li>
		</ul>
	</main>
}
