export type Piece = { readonly key: string; readonly text: string; readonly term: boolean };

// The sentence cut into plain runs and the listed words, in order.
export function pieces(text: string, terms: string): Piece[] {
	const words = new Set(terms.split(' '));
	return text.split(' ').map((text, at) => ({ key: `p${at}`, text, term: words.has(text) }));
}
