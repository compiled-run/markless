// The values the sewing-pattern figure shows and the sentence its live region speaks.
export const FABRICS = ['Browser', 'Server', 'Tests'] as const;

export const describeCut = (cut: boolean) =>
	cut
		? 'The same pattern was cut from all three fabrics: the browser, a server and the tests. Every piece has the same outline, because they all come from the one compiled plan.'
		: 'One paper pattern, the compiled cart, lies above three fabrics: the browser, a server and the tests.';
