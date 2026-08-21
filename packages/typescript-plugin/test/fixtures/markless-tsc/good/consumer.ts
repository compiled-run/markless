import { Counter } from './counter.tsrx';

// The real signature, not a wildcard shim: `start` is a number and `label` a string.
export const counter = Counter;
export const callable: (props: { start: number; label: string }) => unknown = Counter;
