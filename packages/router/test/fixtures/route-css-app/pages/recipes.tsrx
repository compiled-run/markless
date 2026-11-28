import Nav from '../src/nav.tsrx';

export default function Page() @{
	<main>
		<title>Recipes</title>
		<Nav />
		<h1 data-title>{'Recipes'}</h1>
		<p>{'Recipes is a page about one thing. It has a few short paragraphs so its client render has some weight to carry.'}</p>
		<p>{'A second paragraph about Recipes, with a list below it.'}</p>
		<ul>
			<li>{'Recipes one'}</li>
			<li>{'Recipes two'}</li>
			<li>{'Recipes three'}</li>
		</ul>
	</main>
}
