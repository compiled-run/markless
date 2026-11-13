import { computed, state } from '@markless/core';
import { loadCard } from '../src/card.ts';

// A streamed card and 200 buttons outside any list, each with its own state.
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
	let c50 = state(0);
	let c51 = state(0);
	let c52 = state(0);
	let c53 = state(0);
	let c54 = state(0);
	let c55 = state(0);
	let c56 = state(0);
	let c57 = state(0);
	let c58 = state(0);
	let c59 = state(0);
	let c60 = state(0);
	let c61 = state(0);
	let c62 = state(0);
	let c63 = state(0);
	let c64 = state(0);
	let c65 = state(0);
	let c66 = state(0);
	let c67 = state(0);
	let c68 = state(0);
	let c69 = state(0);
	let c70 = state(0);
	let c71 = state(0);
	let c72 = state(0);
	let c73 = state(0);
	let c74 = state(0);
	let c75 = state(0);
	let c76 = state(0);
	let c77 = state(0);
	let c78 = state(0);
	let c79 = state(0);
	let c80 = state(0);
	let c81 = state(0);
	let c82 = state(0);
	let c83 = state(0);
	let c84 = state(0);
	let c85 = state(0);
	let c86 = state(0);
	let c87 = state(0);
	let c88 = state(0);
	let c89 = state(0);
	let c90 = state(0);
	let c91 = state(0);
	let c92 = state(0);
	let c93 = state(0);
	let c94 = state(0);
	let c95 = state(0);
	let c96 = state(0);
	let c97 = state(0);
	let c98 = state(0);
	let c99 = state(0);
	let c100 = state(0);
	let c101 = state(0);
	let c102 = state(0);
	let c103 = state(0);
	let c104 = state(0);
	let c105 = state(0);
	let c106 = state(0);
	let c107 = state(0);
	let c108 = state(0);
	let c109 = state(0);
	let c110 = state(0);
	let c111 = state(0);
	let c112 = state(0);
	let c113 = state(0);
	let c114 = state(0);
	let c115 = state(0);
	let c116 = state(0);
	let c117 = state(0);
	let c118 = state(0);
	let c119 = state(0);
	let c120 = state(0);
	let c121 = state(0);
	let c122 = state(0);
	let c123 = state(0);
	let c124 = state(0);
	let c125 = state(0);
	let c126 = state(0);
	let c127 = state(0);
	let c128 = state(0);
	let c129 = state(0);
	let c130 = state(0);
	let c131 = state(0);
	let c132 = state(0);
	let c133 = state(0);
	let c134 = state(0);
	let c135 = state(0);
	let c136 = state(0);
	let c137 = state(0);
	let c138 = state(0);
	let c139 = state(0);
	let c140 = state(0);
	let c141 = state(0);
	let c142 = state(0);
	let c143 = state(0);
	let c144 = state(0);
	let c145 = state(0);
	let c146 = state(0);
	let c147 = state(0);
	let c148 = state(0);
	let c149 = state(0);
	let c150 = state(0);
	let c151 = state(0);
	let c152 = state(0);
	let c153 = state(0);
	let c154 = state(0);
	let c155 = state(0);
	let c156 = state(0);
	let c157 = state(0);
	let c158 = state(0);
	let c159 = state(0);
	let c160 = state(0);
	let c161 = state(0);
	let c162 = state(0);
	let c163 = state(0);
	let c164 = state(0);
	let c165 = state(0);
	let c166 = state(0);
	let c167 = state(0);
	let c168 = state(0);
	let c169 = state(0);
	let c170 = state(0);
	let c171 = state(0);
	let c172 = state(0);
	let c173 = state(0);
	let c174 = state(0);
	let c175 = state(0);
	let c176 = state(0);
	let c177 = state(0);
	let c178 = state(0);
	let c179 = state(0);
	let c180 = state(0);
	let c181 = state(0);
	let c182 = state(0);
	let c183 = state(0);
	let c184 = state(0);
	let c185 = state(0);
	let c186 = state(0);
	let c187 = state(0);
	let c188 = state(0);
	let c189 = state(0);
	let c190 = state(0);
	let c191 = state(0);
	let c192 = state(0);
	let c193 = state(0);
	let c194 = state(0);
	let c195 = state(0);
	let c196 = state(0);
	let c197 = state(0);
	let c198 = state(0);
	let c199 = state(0);
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
			<button class="b b50" onClick={() => c50++}>Button 50: {c50}</button>
			<button class="b b51" onClick={() => c51++}>Button 51: {c51}</button>
			<button class="b b52" onClick={() => c52++}>Button 52: {c52}</button>
			<button class="b b53" onClick={() => c53++}>Button 53: {c53}</button>
			<button class="b b54" onClick={() => c54++}>Button 54: {c54}</button>
			<button class="b b55" onClick={() => c55++}>Button 55: {c55}</button>
			<button class="b b56" onClick={() => c56++}>Button 56: {c56}</button>
			<button class="b b57" onClick={() => c57++}>Button 57: {c57}</button>
			<button class="b b58" onClick={() => c58++}>Button 58: {c58}</button>
			<button class="b b59" onClick={() => c59++}>Button 59: {c59}</button>
			<button class="b b60" onClick={() => c60++}>Button 60: {c60}</button>
			<button class="b b61" onClick={() => c61++}>Button 61: {c61}</button>
			<button class="b b62" onClick={() => c62++}>Button 62: {c62}</button>
			<button class="b b63" onClick={() => c63++}>Button 63: {c63}</button>
			<button class="b b64" onClick={() => c64++}>Button 64: {c64}</button>
			<button class="b b65" onClick={() => c65++}>Button 65: {c65}</button>
			<button class="b b66" onClick={() => c66++}>Button 66: {c66}</button>
			<button class="b b67" onClick={() => c67++}>Button 67: {c67}</button>
			<button class="b b68" onClick={() => c68++}>Button 68: {c68}</button>
			<button class="b b69" onClick={() => c69++}>Button 69: {c69}</button>
			<button class="b b70" onClick={() => c70++}>Button 70: {c70}</button>
			<button class="b b71" onClick={() => c71++}>Button 71: {c71}</button>
			<button class="b b72" onClick={() => c72++}>Button 72: {c72}</button>
			<button class="b b73" onClick={() => c73++}>Button 73: {c73}</button>
			<button class="b b74" onClick={() => c74++}>Button 74: {c74}</button>
			<button class="b b75" onClick={() => c75++}>Button 75: {c75}</button>
			<button class="b b76" onClick={() => c76++}>Button 76: {c76}</button>
			<button class="b b77" onClick={() => c77++}>Button 77: {c77}</button>
			<button class="b b78" onClick={() => c78++}>Button 78: {c78}</button>
			<button class="b b79" onClick={() => c79++}>Button 79: {c79}</button>
			<button class="b b80" onClick={() => c80++}>Button 80: {c80}</button>
			<button class="b b81" onClick={() => c81++}>Button 81: {c81}</button>
			<button class="b b82" onClick={() => c82++}>Button 82: {c82}</button>
			<button class="b b83" onClick={() => c83++}>Button 83: {c83}</button>
			<button class="b b84" onClick={() => c84++}>Button 84: {c84}</button>
			<button class="b b85" onClick={() => c85++}>Button 85: {c85}</button>
			<button class="b b86" onClick={() => c86++}>Button 86: {c86}</button>
			<button class="b b87" onClick={() => c87++}>Button 87: {c87}</button>
			<button class="b b88" onClick={() => c88++}>Button 88: {c88}</button>
			<button class="b b89" onClick={() => c89++}>Button 89: {c89}</button>
			<button class="b b90" onClick={() => c90++}>Button 90: {c90}</button>
			<button class="b b91" onClick={() => c91++}>Button 91: {c91}</button>
			<button class="b b92" onClick={() => c92++}>Button 92: {c92}</button>
			<button class="b b93" onClick={() => c93++}>Button 93: {c93}</button>
			<button class="b b94" onClick={() => c94++}>Button 94: {c94}</button>
			<button class="b b95" onClick={() => c95++}>Button 95: {c95}</button>
			<button class="b b96" onClick={() => c96++}>Button 96: {c96}</button>
			<button class="b b97" onClick={() => c97++}>Button 97: {c97}</button>
			<button class="b b98" onClick={() => c98++}>Button 98: {c98}</button>
			<button class="b b99" onClick={() => c99++}>Button 99: {c99}</button>
			<button class="b b100" onClick={() => c100++}>Button 100: {c100}</button>
			<button class="b b101" onClick={() => c101++}>Button 101: {c101}</button>
			<button class="b b102" onClick={() => c102++}>Button 102: {c102}</button>
			<button class="b b103" onClick={() => c103++}>Button 103: {c103}</button>
			<button class="b b104" onClick={() => c104++}>Button 104: {c104}</button>
			<button class="b b105" onClick={() => c105++}>Button 105: {c105}</button>
			<button class="b b106" onClick={() => c106++}>Button 106: {c106}</button>
			<button class="b b107" onClick={() => c107++}>Button 107: {c107}</button>
			<button class="b b108" onClick={() => c108++}>Button 108: {c108}</button>
			<button class="b b109" onClick={() => c109++}>Button 109: {c109}</button>
			<button class="b b110" onClick={() => c110++}>Button 110: {c110}</button>
			<button class="b b111" onClick={() => c111++}>Button 111: {c111}</button>
			<button class="b b112" onClick={() => c112++}>Button 112: {c112}</button>
			<button class="b b113" onClick={() => c113++}>Button 113: {c113}</button>
			<button class="b b114" onClick={() => c114++}>Button 114: {c114}</button>
			<button class="b b115" onClick={() => c115++}>Button 115: {c115}</button>
			<button class="b b116" onClick={() => c116++}>Button 116: {c116}</button>
			<button class="b b117" onClick={() => c117++}>Button 117: {c117}</button>
			<button class="b b118" onClick={() => c118++}>Button 118: {c118}</button>
			<button class="b b119" onClick={() => c119++}>Button 119: {c119}</button>
			<button class="b b120" onClick={() => c120++}>Button 120: {c120}</button>
			<button class="b b121" onClick={() => c121++}>Button 121: {c121}</button>
			<button class="b b122" onClick={() => c122++}>Button 122: {c122}</button>
			<button class="b b123" onClick={() => c123++}>Button 123: {c123}</button>
			<button class="b b124" onClick={() => c124++}>Button 124: {c124}</button>
			<button class="b b125" onClick={() => c125++}>Button 125: {c125}</button>
			<button class="b b126" onClick={() => c126++}>Button 126: {c126}</button>
			<button class="b b127" onClick={() => c127++}>Button 127: {c127}</button>
			<button class="b b128" onClick={() => c128++}>Button 128: {c128}</button>
			<button class="b b129" onClick={() => c129++}>Button 129: {c129}</button>
			<button class="b b130" onClick={() => c130++}>Button 130: {c130}</button>
			<button class="b b131" onClick={() => c131++}>Button 131: {c131}</button>
			<button class="b b132" onClick={() => c132++}>Button 132: {c132}</button>
			<button class="b b133" onClick={() => c133++}>Button 133: {c133}</button>
			<button class="b b134" onClick={() => c134++}>Button 134: {c134}</button>
			<button class="b b135" onClick={() => c135++}>Button 135: {c135}</button>
			<button class="b b136" onClick={() => c136++}>Button 136: {c136}</button>
			<button class="b b137" onClick={() => c137++}>Button 137: {c137}</button>
			<button class="b b138" onClick={() => c138++}>Button 138: {c138}</button>
			<button class="b b139" onClick={() => c139++}>Button 139: {c139}</button>
			<button class="b b140" onClick={() => c140++}>Button 140: {c140}</button>
			<button class="b b141" onClick={() => c141++}>Button 141: {c141}</button>
			<button class="b b142" onClick={() => c142++}>Button 142: {c142}</button>
			<button class="b b143" onClick={() => c143++}>Button 143: {c143}</button>
			<button class="b b144" onClick={() => c144++}>Button 144: {c144}</button>
			<button class="b b145" onClick={() => c145++}>Button 145: {c145}</button>
			<button class="b b146" onClick={() => c146++}>Button 146: {c146}</button>
			<button class="b b147" onClick={() => c147++}>Button 147: {c147}</button>
			<button class="b b148" onClick={() => c148++}>Button 148: {c148}</button>
			<button class="b b149" onClick={() => c149++}>Button 149: {c149}</button>
			<button class="b b150" onClick={() => c150++}>Button 150: {c150}</button>
			<button class="b b151" onClick={() => c151++}>Button 151: {c151}</button>
			<button class="b b152" onClick={() => c152++}>Button 152: {c152}</button>
			<button class="b b153" onClick={() => c153++}>Button 153: {c153}</button>
			<button class="b b154" onClick={() => c154++}>Button 154: {c154}</button>
			<button class="b b155" onClick={() => c155++}>Button 155: {c155}</button>
			<button class="b b156" onClick={() => c156++}>Button 156: {c156}</button>
			<button class="b b157" onClick={() => c157++}>Button 157: {c157}</button>
			<button class="b b158" onClick={() => c158++}>Button 158: {c158}</button>
			<button class="b b159" onClick={() => c159++}>Button 159: {c159}</button>
			<button class="b b160" onClick={() => c160++}>Button 160: {c160}</button>
			<button class="b b161" onClick={() => c161++}>Button 161: {c161}</button>
			<button class="b b162" onClick={() => c162++}>Button 162: {c162}</button>
			<button class="b b163" onClick={() => c163++}>Button 163: {c163}</button>
			<button class="b b164" onClick={() => c164++}>Button 164: {c164}</button>
			<button class="b b165" onClick={() => c165++}>Button 165: {c165}</button>
			<button class="b b166" onClick={() => c166++}>Button 166: {c166}</button>
			<button class="b b167" onClick={() => c167++}>Button 167: {c167}</button>
			<button class="b b168" onClick={() => c168++}>Button 168: {c168}</button>
			<button class="b b169" onClick={() => c169++}>Button 169: {c169}</button>
			<button class="b b170" onClick={() => c170++}>Button 170: {c170}</button>
			<button class="b b171" onClick={() => c171++}>Button 171: {c171}</button>
			<button class="b b172" onClick={() => c172++}>Button 172: {c172}</button>
			<button class="b b173" onClick={() => c173++}>Button 173: {c173}</button>
			<button class="b b174" onClick={() => c174++}>Button 174: {c174}</button>
			<button class="b b175" onClick={() => c175++}>Button 175: {c175}</button>
			<button class="b b176" onClick={() => c176++}>Button 176: {c176}</button>
			<button class="b b177" onClick={() => c177++}>Button 177: {c177}</button>
			<button class="b b178" onClick={() => c178++}>Button 178: {c178}</button>
			<button class="b b179" onClick={() => c179++}>Button 179: {c179}</button>
			<button class="b b180" onClick={() => c180++}>Button 180: {c180}</button>
			<button class="b b181" onClick={() => c181++}>Button 181: {c181}</button>
			<button class="b b182" onClick={() => c182++}>Button 182: {c182}</button>
			<button class="b b183" onClick={() => c183++}>Button 183: {c183}</button>
			<button class="b b184" onClick={() => c184++}>Button 184: {c184}</button>
			<button class="b b185" onClick={() => c185++}>Button 185: {c185}</button>
			<button class="b b186" onClick={() => c186++}>Button 186: {c186}</button>
			<button class="b b187" onClick={() => c187++}>Button 187: {c187}</button>
			<button class="b b188" onClick={() => c188++}>Button 188: {c188}</button>
			<button class="b b189" onClick={() => c189++}>Button 189: {c189}</button>
			<button class="b b190" onClick={() => c190++}>Button 190: {c190}</button>
			<button class="b b191" onClick={() => c191++}>Button 191: {c191}</button>
			<button class="b b192" onClick={() => c192++}>Button 192: {c192}</button>
			<button class="b b193" onClick={() => c193++}>Button 193: {c193}</button>
			<button class="b b194" onClick={() => c194++}>Button 194: {c194}</button>
			<button class="b b195" onClick={() => c195++}>Button 195: {c195}</button>
			<button class="b b196" onClick={() => c196++}>Button 196: {c196}</button>
			<button class="b b197" onClick={() => c197++}>Button 197: {c197}</button>
			<button class="b b198" onClick={() => c198++}>Button 198: {c198}</button>
			<button class="b b199" onClick={() => c199++}>Button 199: {c199}</button>
		</div>
	</main>
}
