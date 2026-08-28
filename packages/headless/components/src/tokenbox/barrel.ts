/**
 * The family under the name the package barrel will give it.
 *
 * Scenarios import `{ tokenbox }` from here rather than from `src/index.ts`
 * because the package barrel is added at registration, not by the unit that
 * builds a family. The shape is identical — a namespace object under the
 * family's name — so the swap is one line per scenario when
 * `export * as tokenbox from './tokenbox/index.ts'` lands, and this file goes
 * away with it.
 */
export * as tokenbox from './index.ts';
