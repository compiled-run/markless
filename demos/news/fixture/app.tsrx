import { state } from '@markless/core';
import { generateArticles } from '../../ssr-throughput/gen.mjs';

const ARTICLES = generateArticles(50);

export default function News() @{
	let dark = state(false);
	const articles = state(ARTICLES);
	<div class="site">
		<header class={dark ? 'masthead dark' : 'masthead'}>
			<h1>The Markless Times</h1>
			<button id="theme" type="button" onClick={() => dark = !dark}>
				{dark ? 'Light mode' : 'Dark mode'}
			</button>
		</header>
		<main class="feed">
			@for (const article of articles; key article.id) {
				<article class="card" data-news-card={article.id}>
					<span class="section">{article.section}</span>
					<h2>{article.title}</h2>
					<p class="byline">{article.byline}</p>
					<p class="lead">{article.lead}</p>
					<p class="body">{article.body}</p>
					<footer>{article.points} points</footer>
				</article>
			}
		</main>
		<footer class="foot">The Markless Times — production resume benchmark</footer>
	</div>
}
