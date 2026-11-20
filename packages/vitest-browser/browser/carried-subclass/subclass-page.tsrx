import { state } from '@markless/core';

class Base {
	start() {
		return 40;
	}
}

class Derived extends Base {
	start() {
		return super.start() + 2;
	}
}

export function SubclassPage() @{
	let count = state(new Derived().start());
	<button data-bump onClick={() => { count += 1; }}>{count}</button>
}
