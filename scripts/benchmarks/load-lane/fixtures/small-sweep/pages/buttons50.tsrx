import { computed, state } from '@markless/core';
import { loadCard } from '../src/card.ts';

// A streamed card and 50 buttons outside any list, each with its own state.
export default function Page() @{
	let c0 = state(0);
	let c1 = state(0);
	let c2 = state(0);
	let c3 = state(0);
	let c4 = state(0);
	let c5 = state(0);
	let c6 = state(0);
	let c7 = state(0);
	let c8 = state(0);
	let c9 = state(0);
	let c10 = state(0);
	let c11 = state(0);
	let c12 = state(0);
	let c13 = state(0);
	let c14 = state(0);
	let c15 = state(0);
	let c16 = state(0);
	let c17 = state(0);
	let c18 = state(0);
	let c19 = state(0);
	let c20 = state(0);
	let c21 = state(0);
	let c22 = state(0);
	let c23 = state(0);
	let c24 = state(0);
	let c25 = state(0);
	let c26 = state(0);
	let c27 = state(0);
	let c28 = state(0);
	let c29 = state(0);
	let c30 = state(0);
	let c31 = state(0);
	let c32 = state(0);
	let c33 = state(0);
	let c34 = state(0);
	let c35 = state(0);
	let c36 = state(0);
	let c37 = state(0);
	let c38 = state(0);
	let c39 = state(0);
	let c40 = state(0);
	let c41 = state(0);
	let c42 = state(0);
	let c43 = state(0);
	let c44 = state(0);
	let c45 = state(0);
	let c46 = state(0);
	let c47 = state(0);
	let c48 = state(0);
	let c49 = state(0);
	const card = computed(async () => loadCard());

	<main>
		@try {
			<p class="card">{card.title}: {card.total}</p>
		} @pending {
			<p class="card">Loading</p>
		}
		<div class="buttons">
			<button class="b b0" onClick={() => c0++}>Button 0: {c0}</button>
			<button class="b b1" onClick={() => c1++}>Button 1: {c1}</button>
			<button class="b b2" onClick={() => c2++}>Button 2: {c2}</button>
			<button class="b b3" onClick={() => c3++}>Button 3: {c3}</button>
			<button class="b b4" onClick={() => c4++}>Button 4: {c4}</button>
			<button class="b b5" onClick={() => c5++}>Button 5: {c5}</button>
			<button class="b b6" onClick={() => c6++}>Button 6: {c6}</button>
			<button class="b b7" onClick={() => c7++}>Button 7: {c7}</button>
			<button class="b b8" onClick={() => c8++}>Button 8: {c8}</button>
			<button class="b b9" onClick={() => c9++}>Button 9: {c9}</button>
			<button class="b b10" onClick={() => c10++}>Button 10: {c10}</button>
			<button class="b b11" onClick={() => c11++}>Button 11: {c11}</button>
			<button class="b b12" onClick={() => c12++}>Button 12: {c12}</button>
			<button class="b b13" onClick={() => c13++}>Button 13: {c13}</button>
			<button class="b b14" onClick={() => c14++}>Button 14: {c14}</button>
			<button class="b b15" onClick={() => c15++}>Button 15: {c15}</button>
			<button class="b b16" onClick={() => c16++}>Button 16: {c16}</button>
			<button class="b b17" onClick={() => c17++}>Button 17: {c17}</button>
			<button class="b b18" onClick={() => c18++}>Button 18: {c18}</button>
			<button class="b b19" onClick={() => c19++}>Button 19: {c19}</button>
			<button class="b b20" onClick={() => c20++}>Button 20: {c20}</button>
			<button class="b b21" onClick={() => c21++}>Button 21: {c21}</button>
			<button class="b b22" onClick={() => c22++}>Button 22: {c22}</button>
			<button class="b b23" onClick={() => c23++}>Button 23: {c23}</button>
			<button class="b b24" onClick={() => c24++}>Button 24: {c24}</button>
			<button class="b b25" onClick={() => c25++}>Button 25: {c25}</button>
			<button class="b b26" onClick={() => c26++}>Button 26: {c26}</button>
			<button class="b b27" onClick={() => c27++}>Button 27: {c27}</button>
			<button class="b b28" onClick={() => c28++}>Button 28: {c28}</button>
			<button class="b b29" onClick={() => c29++}>Button 29: {c29}</button>
			<button class="b b30" onClick={() => c30++}>Button 30: {c30}</button>
			<button class="b b31" onClick={() => c31++}>Button 31: {c31}</button>
			<button class="b b32" onClick={() => c32++}>Button 32: {c32}</button>
			<button class="b b33" onClick={() => c33++}>Button 33: {c33}</button>
			<button class="b b34" onClick={() => c34++}>Button 34: {c34}</button>
			<button class="b b35" onClick={() => c35++}>Button 35: {c35}</button>
			<button class="b b36" onClick={() => c36++}>Button 36: {c36}</button>
			<button class="b b37" onClick={() => c37++}>Button 37: {c37}</button>
			<button class="b b38" onClick={() => c38++}>Button 38: {c38}</button>
			<button class="b b39" onClick={() => c39++}>Button 39: {c39}</button>
			<button class="b b40" onClick={() => c40++}>Button 40: {c40}</button>
			<button class="b b41" onClick={() => c41++}>Button 41: {c41}</button>
			<button class="b b42" onClick={() => c42++}>Button 42: {c42}</button>
			<button class="b b43" onClick={() => c43++}>Button 43: {c43}</button>
			<button class="b b44" onClick={() => c44++}>Button 44: {c44}</button>
			<button class="b b45" onClick={() => c45++}>Button 45: {c45}</button>
			<button class="b b46" onClick={() => c46++}>Button 46: {c46}</button>
			<button class="b b47" onClick={() => c47++}>Button 47: {c47}</button>
			<button class="b b48" onClick={() => c48++}>Button 48: {c48}</button>
			<button class="b b49" onClick={() => c49++}>Button 49: {c49}</button>
		</div>
	</main>
}
