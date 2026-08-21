import { Counter } from './counter.tsrx';

// `start` is a number in counter.tsrx. Under the wildcard shim the props were
// Record<string, unknown> and this passed; against the real signature it does not.
export const wrong = Counter({ start: 'one', label: 'clicks' });
