import { beforeEach } from 'vitest';
import { parkPointerClearOfMount } from './pointer-parking.ts';

// Setup file for the `ui` browser project: every suite in it mounts under the
// cursor the previous test left behind, so park before each one.
beforeEach(parkPointerClearOfMount);
