// Prints the iOS host tests' pass key for CI's mobile-hosts workflow; node builtins only, so it runs before `pnpm install`.
import { join } from 'node:path';
import { dragonCheckout, iosHostTestsKey } from './host-tests.ts';

console.log(iosHostTestsKey(join(import.meta.dirname, '..', 'adapters', 'ios'), dragonCheckout()));
