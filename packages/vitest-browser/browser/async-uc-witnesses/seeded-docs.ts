import { answer } from '../matched-values/gates.ts';

export type Doc = { readonly id: string; readonly body: string };

export function loadDoc(id: string): Promise<Doc> {
	return answer(`doc:${id}`, { id, body: `Body of ${id}` });
}
