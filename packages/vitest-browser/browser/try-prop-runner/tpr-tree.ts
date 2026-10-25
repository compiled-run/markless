export interface Twig {
	readonly id: number;
	readonly name: string;
	readonly kids: readonly number[];
}
const TWIGS: Record<number, Twig> = {
	1: { id: 1, name: 'trunk', kids: [2, 3] },
	2: { id: 2, name: 'bough', kids: [4] },
	3: { id: 3, name: 'sprig', kids: [] },
	4: { id: 4, name: 'leaf', kids: [] },
};
export const twig = async (id: number): Promise<Twig> => {
	await new Promise((resolve) => setTimeout(resolve, 10));
	return TWIGS[id]!;
};
