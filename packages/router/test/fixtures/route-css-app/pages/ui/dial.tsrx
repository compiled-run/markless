import Nav from '../../src/nav.tsrx';
import Study from '../../src/study.tsrx';

export default function Page() @{
	<main>
		<title>Dial</title>
		<Nav />
		<h1 data-title>{'Dial'}</h1>
		<p>{'Dial is a page about one thing. It has a few short paragraphs so its client render has some weight to carry.'}</p>
		<p>{'A second paragraph about Dial, with a list below it.'}</p>
		<ul>
			<li>{'Dial one'}</li>
			<li>{'Dial two'}</li>
			<li>{'Dial three'}</li>
		</ul>
		<Study label="Dial" />
	</main>
}
