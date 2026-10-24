import { bump } from '../src/count.ts';

export default function bumpCount() {
	return { count: bump() };
}
