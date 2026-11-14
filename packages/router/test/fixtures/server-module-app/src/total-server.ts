import { total } from '../api/total.ts';

export function serverTotal(): string {
	return total();
}
