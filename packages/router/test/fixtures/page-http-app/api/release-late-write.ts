import { openLateWriteGate } from '../src/late-write.ts';

export default function releaseLateWrite() {
	return { released: openLateWriteGate() };
}
