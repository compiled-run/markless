import type { AsyncComputedPlaneFactory } from './graph.ts';
import { createAsyncPlane } from './graph-async-load.ts';
import * as refresh from './graph-async-refresh.ts';

export type {
	AsyncPlaneContext,
	AsyncPlaneState,
	AsyncRefresh,
	AsyncRefreshModule,
	RuntimeAsyncAnswer,
	RuntimeAsyncComputedNode,
	RuntimeAsyncInput,
} from './graph-async-load.ts';

/** Async computeds with their refresh half at hand; a graph without async values never loads this module. */
export const createAsyncComputedPlane: AsyncComputedPlaneFactory = (internals, asyncComputed) =>
	createAsyncPlane(internals, asyncComputed, () => refresh);
