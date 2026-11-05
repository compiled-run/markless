// The values the film-bench figure shows and the sentence its live region speaks.
export const FRAMES = [
	{ id: 'state:bags', code: 'let bags = state(0);', what: 'the state' },
	{ id: 'symbol:0', code: 'onClick={() => bags++}', what: 'the click' },
	{ id: 'symbol:1', code: '{bags} bags', what: 'the text' },
] as const;

export const EDIT_LIST = ['h2 click → symbol:0', 'state:bags → symbol:1'] as const;

export const describeBench = (cut: boolean) =>
	cut
		? 'The file was cut into frames before anything ran: state:bags, symbol:0 for the click and symbol:1 for the text, each hung on its own peg. The edit list says which frame plays at which element.'
		: 'cart.tsrx lies on the bench as one strip of film, not cut yet.';
