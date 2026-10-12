/** One run of a sentence: plain text, or a word that opens a `Term`. */
export interface Piece {
	readonly key: string;
	readonly text: string;
	readonly term: boolean;
}

/** Cuts `text` at the first whole-word match of each listed term, in sentence order. */
export function splitTerms(text: string, terms: string): Piece[] {
	const words = terms.split(/\s+/).filter(Boolean);
	const hits = words
		.map((word) => ({ word, at: text.search(new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`)) }))
		.filter((hit) => hit.at >= 0)
		.sort((a, b) => a.at - b.at);
	const pieces: Piece[] = [];
	let from = 0;
	for (const { word, at } of hits) {
		if (at < from) continue;
		if (at > from) pieces.push({ key: `t${from}`, text: text.slice(from, at), term: false });
		pieces.push({ key: `w${at}`, text: word, term: true });
		from = at + word.length;
	}
	if (from < text.length) pieces.push({ key: `t${from}`, text: text.slice(from), term: false });
	return pieces;
}
