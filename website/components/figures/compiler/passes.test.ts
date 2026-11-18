import { expect, test } from 'vitest';
import { defaultCompilerPasses } from '../../../../packages/compiler/src/pass-registry.ts';
import { describedPassIds, passLines } from './passes.ts';

test('the list follows the registry order and words every pass in it', () => {
	expect(passLines.map((line) => line.id)).toEqual(defaultCompilerPasses.map((pass) => pass.passId));
	expect([...describedPassIds].sort()).toEqual(defaultCompilerPasses.map((pass) => pass.passId).sort());
});
