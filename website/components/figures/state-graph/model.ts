export const PRICE = 14;
export const START_BAGS = 2;

export const totalFor = (bags: number) => bags * PRICE;

export const presses = (count: number) => (count === 1 ? 'once' : count + ' times');

export const describe = (bags: number) =>
	`Added a bag. In your cart now shows ${bags} bags and the total shows $${totalFor(bags)}. The product line did not change.`;
