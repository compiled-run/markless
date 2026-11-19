import { categories } from '../server/catalog.ts';

export default function list() {
	return Response.json(categories);
}
