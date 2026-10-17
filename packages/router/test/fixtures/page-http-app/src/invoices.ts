const invoices: Readonly<Record<string, { readonly number: string }>> = {
	'7': { number: 'INV-0007' },
};

export function findInvoice(id: string) {
	return invoices[id];
}
