// Records which test file this vitest worker runs, so unit-budget.mjs can split its memory peak by file.
import { writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { expect } from 'vitest';

const dir = process.env.MARKLESS_UNIT_BUDGET_FILES;
const file = expect.getState().testPath;
if (dir && file) writeFileSync(join(dir, String(process.pid)), relative(process.cwd(), file));
