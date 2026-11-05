// The values the prep-tub figure shows and the sentences its live region speaks.
export const TUBS = { add: 'Add', gift: 'Gift' } as const;

export const describePass = (add: boolean, gift: boolean) => {
	if (!add && !gift) return 'Two prep tubs, Add and Gift, arrived with the page and stand sealed.';
	const open = [add ? 'Add' : '', gift ? 'Gift' : ''].filter(Boolean).join(' and ');
	const sealed = !add ? 'Add' : !gift ? 'Gift' : '';
	return `${open} ${add && gift ? 'were' : 'was'} ordered and opened. ${sealed ? `${sealed} arrived too, and stays sealed until it is ordered.` : 'Both arrived with the page; each opened only when ordered.'}`;
};

export const NO_TUB = 'That order has no tub, so the ticket came back.';
