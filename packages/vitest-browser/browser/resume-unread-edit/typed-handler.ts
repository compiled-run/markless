import { pass } from './gates.ts';

// The input handler's code arrives only when the test opens this gate.
await pass('typed-code');

export function typedText(event: Event): string {
	return (event.currentTarget as HTMLInputElement).value;
}
