import { state } from '@markless/core';
import { ARTICLES_50 } from './data.mjs';

export default function News50() @{
	const articles = state(ARTICLES_50);
	<main data-news-page>
		@for (const article of articles; key article.id) {
			<article data-news-card={article.id}>
				<header><span>{article.section}</span><h2>{article.title}</h2><p>{article.byline}</p></header>
				<p>{article.lead}</p><p>{article.body}</p><footer>{article.points} points</footer>
			</article>
		}
	</main>
}
