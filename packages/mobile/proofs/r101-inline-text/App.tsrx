import { state } from '@markless/core';

export default function App() @{
	let likes = state(1);
	<main>
		<h1>Inline text</h1>
		<p>Plain, <strong>strong</strong>, <em>em</em>, <b>b</b> and <i>i</i> text</p>
		<p>An <abbr title="abbreviation">abbr</abbr>, a <cite>cite</cite>, a <dfn>dfn</dfn> and a <var>var</var></p>
		<p><small>Small print</small> with <mark>marked</mark>, <u>underlined</u>, <s>struck</s>, <del>deleted</del> and <ins>inserted</ins> words</p>
		<p>H<sub>2</sub>O and E = mc<sup>2</sup></p>
		<p>She said <q>hello</q></p>
		<p>Liked by <strong>{likes} {likes === 1 ? 'reader' : 'readers'}</strong> so far</p>
		<button onClick={() => likes++}>Like</button>
	</main>
}
