import { notes } from '../lib/notes.ts';

export default function listNotes(): Response {
	return Response.json(notes);
}
