let posts = 0;

export const cache = { maxAge: 60 };

export default function tally() {
	posts += 1;
	return Response.json({ posts });
}
