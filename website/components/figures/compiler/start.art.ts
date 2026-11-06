// Written by start.test.ts from a real compile of START_SOURCE. Run the figure test with -u to refresh.
import type { Explored } from './pieces.ts';

export const START: Explored = {
	"pieces": [
		{
			"id": "state:draft",
			"kind": "state",
			"what": "a watched value",
			"line": 3,
			"from": 1,
			"to": 24
		},
		{
			"id": "symbol:1",
			"kind": "update",
			"what": "updates the <p>",
			"line": 6,
			"from": 13,
			"to": 20
		},
		{
			"id": "symbol:0",
			"kind": "handler",
			"what": "runs on input",
			"line": 8,
			"from": 3,
			"to": 44
		}
	],
	"errors": []
};
