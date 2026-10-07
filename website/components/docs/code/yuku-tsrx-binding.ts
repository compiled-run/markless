import { wasmExports } from './wasm.ts';
import { createYukuTsrxBinding } from './yuku-tsrx-wasm.ts';

export default createYukuTsrxBinding(() => wasmExports('tsrx'));
