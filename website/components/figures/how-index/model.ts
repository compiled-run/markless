// The values the field-book figure shows and the sentence its live region speaks.
export const FILES = ['page.tsrx', 'header.tsrx', 'cart.tsrx'] as const;

export const describeSurvey = (surveyed: boolean) =>
	surveyed
		? 'The survey is inked and stamped at build time: page.tsrx holds header.tsrx and cart.tsrx, and the two yellow spots in cart.tsrx are the only places that can change. Nobody has visited yet.'
		: 'The field book has one page sketched for each file, and the map that joins them is still in pencil.';
