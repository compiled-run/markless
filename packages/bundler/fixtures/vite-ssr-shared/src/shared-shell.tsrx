import { shared, state } from 'arcade';

export const shell = shared(() => {
	const data = state({
		activeCartId: 'server-cart',
		status: 'server-ready',
	});

	return {
		...data,
	};
}, { scope: 'page' });
