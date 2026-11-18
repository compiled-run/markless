import { state } from '@markless/core';

export default function App() @{
	let presses = state(0);
	<main>
		<h1>Long page</h1>
		<p>Section 1</p>
		<p>Section 2</p>
		<p>Section 3</p>
		<p>Section 4</p>
		<p>Section 5</p>
		<p>Section 6</p>
		<p>Section 7</p>
		<p>Section 8</p>
		<p>Section 9</p>
		<p>Section 10</p>
		<p>Section 11</p>
		<p>Section 12</p>
		<p>Section 13</p>
		<p>Section 14</p>
		<p>Section 15</p>
		<p>Section 16</p>
		<p>Section 17</p>
		<p>Section 18</p>
		<p>Section 19</p>
		<p>Section 20</p>
		<p>Section 21</p>
		<p>Section 22</p>
		<p>Section 23</p>
		<p>Section 24</p>
		<p>Section 25</p>
		<p>Section 26</p>
		<p>Section 27</p>
		<p>Section 28</p>
		<p>Section 29</p>
		<p>Section 30</p>
		<p>Section 31</p>
		<p>Section 32</p>
		<p>Section 33</p>
		<p>Section 34</p>
		<p>Section 35</p>
		<p>Section 36</p>
		<p>Section 37</p>
		<p>Section 38</p>
		<p>Section 39</p>
		<p>Section 40</p>
		<p>Section 41</p>
		<p>Section 42</p>
		<p>Section 43</p>
		<p>Section 44</p>
		<p>Section 45</p>
		<p>Section 46</p>
		<p>Section 47</p>
		<p>Section 48</p>
		<p>Section 49</p>
		<p>Section 50</p>
		<p>Section 51</p>
		<p>Section 52</p>
		<p>Section 53</p>
		<p>Section 54</p>
		<p>Section 55</p>
		<p>Section 56</p>
		<p>Section 57</p>
		<p>Section 58</p>
		<p>Section 59</p>
		<p>Section 60</p>
		<button onClick={() => presses++}>Press me</button>
		<p>Pressed {presses}</p>
		<p>Page end</p>
	</main>
}
