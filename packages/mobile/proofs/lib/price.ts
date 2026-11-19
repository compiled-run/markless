/** Whole dollars grouped by thousands, then the cents: `$1,234.56`. */
export function formatPrice(cents: number): string {
	const digits = String(Math.floor(cents / 100));
	let grouped = '';
	for (let index = 0; index < digits.length; index++) {
		if (index > 0 && (digits.length - index) % 3 === 0) grouped += ',';
		grouped += digits[index];
	}
	return `$${grouped}.${String(cents % 100).padStart(2, '0')}`;
}
