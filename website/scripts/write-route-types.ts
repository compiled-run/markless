// Writes the route types `markless-router-env.d.ts` points at, which only a dev or build run writes otherwise, so a fresh checkout can type-check.
import { promises as fs } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeRouteTypes } from '../../packages/router/src/vite/route-typegen.ts';

await writeRouteTypes(fs, resolve(dirname(fileURLToPath(import.meta.url)), '..'));
