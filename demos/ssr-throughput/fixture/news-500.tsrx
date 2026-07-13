import { state } from '@markless/core';
import { ARTICLES_500 } from './data.mjs';

export default function News500() @{
	const articles = state(ARTICLES_500);
	<main data-news-page>
		@for (const article of articles; key article.id) {
			<article data-news-card={article.id}>
				<header><span>{article.section}</span><h2>{article.title}</h2><p>{article.byline}</p></header>
				<p>{article.lead}</p><p>{article.body}</p><footer>{article.points} points</footer>
			</article>
		}
	</main>
}
