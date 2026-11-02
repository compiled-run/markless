/** One stretch of a page: the id of the heading it sits under ('' before the first one), that heading's words, and its text. */
export type SearchPart = readonly [id: string, heading: string, text: string];

export type SearchPage = {
	readonly href: string;
	readonly title: string;
	/** The sidebar section the page sits in. */
	readonly section: string;
	readonly parts: readonly SearchPart[];
};

export type SearchIndex = { readonly pages: readonly SearchPage[] };

/** A cut of a section's text around the first word searched for, split so that word can be marked. */
export type Snippet = { readonly before: string; readonly match: string; readonly after: string };

/** One place to go: a heading on a page, or the top of the page when `heading` is empty. */
export type SearchHit = {
	/** The URL the hit opens, with the heading's anchor. Also the option's value. */
	readonly value: string;
	readonly heading: string;
	readonly snippet: Snippet;
};

export type SearchGroup = {
	readonly href: string;
	readonly title: string;
	readonly section: string;
	readonly hits: readonly SearchHit[];
};

const MAX_PAGES = 8;
const MAX_HITS = 3;
const SNIPPET = 140;

const termsOf = (query: string) => [...new Set(query.toLowerCase().split(/\s+/).filter((term) => term !== ''))];

function weigh(haystack: string, term: string, weight: number): number {
	const at = haystack.indexOf(term);
	if (at < 0) return 0;
	const wordStart = at === 0 || /[^a-z0-9]/.test(haystack[at - 1]!);
	return weight * (wordStart ? 2 : 1);
}

/** Cuts the text around the first word searched for, and splits the cut at that word. */
export function snippetOf(text: string, terms: readonly string[]): Snippet {
	const lower = text.toLowerCase();
	let first = -1;
	let term = '';
	for (const one of terms) {
		const at = lower.indexOf(one);
		if (at >= 0 && (first < 0 || at < first)) [first, term] = [at, one];
	}
	if (first < 0) return { before: cut(text, 0, SNIPPET), match: '', after: '' };
	const start = first > 40 ? text.indexOf(' ', first - 40) + 1 || first - 40 : 0;
	const end = first + term.length;
	return {
		before: (start > 0 ? '…' : '') + text.slice(start, first),
		match: text.slice(first, end),
		after: cut(text, end, SNIPPET - (end - start)),
	};
}

/** `length` characters of `text` from `start`, ended at a word break, with an ellipsis when it cut. */
function cut(text: string, start: number, length: number): string {
	if (start + length >= text.length) return text.slice(start);
	const space = text.lastIndexOf(' ', start + length);
	return text.slice(start, space > start ? space : start + length) + '…';
}

/** Pages whose title, a heading or the text under it holds every word of the query, best first, each with its best headings. */
export function searchDocs(index: SearchIndex | undefined, query: string): SearchGroup[] {
	const terms = termsOf(query);
	if (!index || terms.length === 0) return [];
	const groups: { group: SearchGroup; score: number }[] = [];
	for (const page of index.pages) {
		const title = page.title.toLowerCase();
		const scored: { hit: SearchHit; score: number }[] = [];
		for (const [id, heading, text] of page.parts) {
			const lowerHeading = heading.toLowerCase();
			const lowerText = text.toLowerCase();
			let score = 0;
			let complete = true;
			for (const term of terms) {
				const found = weigh(title, term, 6) + weigh(lowerHeading, term, 4) + weigh(lowerText, term, 1);
				if (found === 0) complete = false;
				score += found;
			}
			if (!complete) continue;
			if (id === '') score += 1;
			scored.push({
				hit: { value: page.href + (id ? '#' + id : ''), heading, snippet: snippetOf(text, terms) },
				score,
			});
		}
		if (scored.length === 0) continue;
		scored.sort((a, b) => b.score - a.score);
		groups.push({
			group: { href: page.href, title: page.title, section: page.section, hits: scored.slice(0, MAX_HITS).map(({ hit }) => hit) },
			score: scored[0]!.score,
		});
	}
	groups.sort((a, b) => b.score - a.score);
	return groups.slice(0, MAX_PAGES).map(({ group }) => group);
}

/** One row of the result list: a hit with the page it belongs to, and whether it is that page's first row. */
export type SearchRow = SearchHit & {
	/** Unique per row and per query, so a row is drawn afresh when its snippet changes. */
	readonly key: string;
	/** The heading, or the page's title for the top of the page. */
	readonly title: string;
	/** The page's title, or '' when the row is the top of the page and its title already says it. */
	readonly page: string;
	readonly section: string;
	readonly first: boolean;
};

/** `searchDocs` flattened into the rows the dialog lists, best page first. */
export function searchRows(index: SearchIndex | undefined, query: string): SearchRow[] {
	const terms = termsOf(query).join(' ');
	return searchDocs(index, query).flatMap((group) =>
		group.hits.map((hit, at) => ({
			...hit,
			key: hit.value + ' ' + terms,
			title: hit.heading === '' ? group.title : hit.heading,
			page: hit.heading === '' ? '' : group.title,
			section: group.section,
			first: at === 0,
		})),
	);
}

/** Everything the dialog shows for one query: its rows, and which of the three notes stands in for them. */
export type SearchView = {
	readonly query: string;
	readonly rows: readonly SearchRow[];
	/** Nothing typed yet. */
	readonly idle: boolean;
	/** Something typed, and the index is still on its way. */
	readonly waiting: boolean;
	/** Something typed, the index is here, and nothing matches. */
	readonly nothing: boolean;
};

export function searchView(index: SearchIndex | undefined, typed: string): SearchView {
	const query = typed.trim();
	const rows = searchRows(index, query);
	return { query, rows, idle: query === '', waiting: query !== '' && !index, nothing: query !== '' && !!index && rows.length === 0 };
}
