export type Quote = { readonly text: string };

// The browser test steers each fetch; the server render answers on its own, slower than the first flush.
export const quotes = {
	runs: 0,
	answer: async (id: number): Promise<Quote> => {
		await new Promise((resolve) => setTimeout(resolve, 60));
		return { text: `quote ${id}` };
	},
};

export async function loadQuote(id: number): Promise<Quote> {
	quotes.runs++;
	return await quotes.answer(id);
}
