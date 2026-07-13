import { generateArticles } from '../gen.mjs';

export const ARTICLES_50 = generateArticles(50);
export const ARTICLES_500 = generateArticles(500);
export const ESCAPE_SENTINEL = '</style><script data-markless-probe>&';
export const ESCAPE_ROWS = Array.from({ length: 10_000 }, (_, index) => ({
	id: index,
	text: `${ESCAPE_SENTINEL}:${index}`,
}));
