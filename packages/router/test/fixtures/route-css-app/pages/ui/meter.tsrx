import Nav from '../../src/nav.tsrx';
import Study from '../../src/study.tsrx';

export default function Page() @{
	<main>
		<title>Meter</title>
		<Nav />
		<h1 data-title>{'Meter'}</h1>
		<p>{'Meter is a page about one thing. It has a few short paragraphs so its client render has some weight to carry.'}</p>
		<p>{'A second paragraph about Meter, with a list below it.'}</p>
		<ul>
			<li>{'Meter one'}</li>
			<li>{'Meter two'}</li>
			<li>{'Meter three'}</li>
		</ul>
		<Study label="Meter" />
	</main>
}
