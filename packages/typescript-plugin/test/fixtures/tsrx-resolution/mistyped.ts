import { root } from './index.ts';
import { NotAPart } from './scenarios/basic.tsrx';

// Both lines must go red: real prop types reject a number heading, and a real
// export list has no NotAPart. A fallback module type would accept both.
export const heading: Parameters<typeof root>[0]['heading'] = 42;
export const missing = NotAPart;
