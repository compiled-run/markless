export function normalize(form: { email: string }): void {
	form.email = form.email.trim().toLowerCase();
}
export const registry = new Map<string, (s: { count: number }) => void>([
	[
		'inc',
		(s) => {
			s.count++;
		},
	],
	[
		'dec',
		(s) => {
			s.count--;
		},
	],
]);
