import { counterBias } from './counter-bias.ts';

export function counterStep(): number {
	return 1 + counterBias;
}
