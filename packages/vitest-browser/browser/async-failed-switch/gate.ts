// Requests the test answers or fails by hand; on the server they answer at once so the first render settles.
type Pending = { readonly key: string; readonly settle: (failure?: string) => void };
const waiting: Pending[] = [];

function ask<T>(key: string, value: () => T): Promise<T> {
	if (typeof window === 'undefined') return Promise.resolve(value());
	return new Promise((resolve, reject) =>
		waiting.push({
			key,
			settle: (failure) => (failure ? reject(new Error(failure)) : resolve(value())),
		}),
	);
}

export function asked(key: string): boolean {
	return waiting.some((entry) => entry.key === key);
}

export function answer(key: string, failure?: string): void {
	const index = waiting.findIndex((entry) => entry.key === key);
	if (index < 0)
		throw new Error(
			`no request waiting for ${key}; waiting: ${waiting.map((entry) => entry.key).join(', ')}`,
		);
	waiting.splice(index, 1)[0]!.settle(failure);
}

export function forgetRequests(): void {
	waiting.length = 0;
}

const invoices = [250, 150, 350, 450, 550, 200, 300, 400].map((amount, index) => ({
	id: `INV-${index + 1}`,
	amount,
}));

export function getInvoices(page: number, reload: number) {
	return ask(`page:${page}`, () => ({
		page,
		pages: 2,
		rows: invoices.slice((page - 1) * 4, page * 4).map((invoice) => {
			const amount = invoice.amount + reload * 25;
			return { ...invoice, eur: `€${amount}`, usd: `$${amount * 2}` };
		}),
	}));
}

const siteInvoices = [250, 150, 350, 450, 550, 200, 300, 400, 120, 610].map((amount, index) => ({
	id: `INV-00${index + 1}`.replace('0010', '010'),
	customer: `Customer ${index + 1}`,
	status: (['paid', 'pending', 'overdue'] as const)[index % 3]!,
	amount,
}));

const money = (amount: number, usd: boolean) =>
	new Intl.NumberFormat('en-US', { style: 'currency', currency: usd ? 'USD' : 'EUR' }).format(
		usd ? amount * 1.1 : amount,
	);

export function getSiteInvoices(page: number, reload: number) {
	return ask(`site:${page}:${reload}`, () => ({
		page,
		pages: Math.ceil(siteInvoices.length / 4),
		rows: siteInvoices.slice((page - 1) * 4, page * 4).map((invoice) => {
			const amount = invoice.amount + reload * 25;
			return { ...invoice, eur: money(amount, false), usd: money(amount, true) };
		}),
	}));
}

export function getCount(round: number) {
	return Promise.resolve(round + 3);
}
