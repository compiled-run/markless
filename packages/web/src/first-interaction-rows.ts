/** Rows a page may serve and still start its runtime at the first interaction; above it, the runtime starts after load. */
// Measured at 6x CPU: up to 10 rows the first press lands within a frame of a load-time start with 3 ms to spare; at 20 it does not reliably.
export const MARKLESS_FIRST_INTERACTION_ROW_LIMIT = 10;
