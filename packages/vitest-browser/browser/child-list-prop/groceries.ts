// A grocery fetch stand-in the test answers by hand.
export type Grocery = { readonly id: string; readonly name: string };

let answer: ((rows: Grocery[]) => void) | undefined;

export function getGroceries(): Promise<Grocery[]> {
	return new Promise((resolve) => (answer = resolve));
}

export function answerGroceries(rows: Grocery[]): void {
	const settle = answer;
	answer = undefined;
	settle?.(rows);
}

export function groceriesAsked(): boolean {
	return answer !== undefined;
}
