// shadcn's cn() without tailwind-merge: callers here never pass a class that conflicts with a variant's.
export function cn(...classes: Array<string | false | null | undefined>): string {
	return classes.filter(Boolean).join(' ');
}
