import { beforeEach } from 'vitest';
import { parkPointerClearOfMount } from './pointer-parking.ts';

// A scenario handler imports the @markless/ui barrel; cold in the dev server that is a multi-second
// waterfall a build never pays, and it would land inside the first gesture's poll.
await import('../src/index.ts');

// The pointer rests wherever the runner's page put it; a family mounted under it takes a hover nobody performed.
beforeEach(parkPointerClearOfMount);
