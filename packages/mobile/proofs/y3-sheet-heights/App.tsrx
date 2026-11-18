import { state } from '@markless/core';
import { native } from '@markless/device';

export default function App() @{
	let browsing = state(false);
	<main>
		<h1>Catalog</h1>
		<button onClick={() => (browsing = true)}>Browse</button>
		<native.sheet open={browsing} onChange={(open) => (browsing = open)} snapPoints={[0.5, 1]}>
			<h2>All items</h2>
			<p>Item 1</p>
			<p>Item 2</p>
			<p>Item 3</p>
			<p>Item 4</p>
			<p>Item 5</p>
			<p>Item 6</p>
			<p>Item 7</p>
			<p>Item 8</p>
			<p>Item 9</p>
			<p>Item 10</p>
			<p>Item 11</p>
			<p>Item 12</p>
			<p>Item 13</p>
			<p>Item 14</p>
			<p>Item 15</p>
			<p>Item 16</p>
			<p>Item 17</p>
			<p>Item 18</p>
			<p>Item 19</p>
			<p>Item 20</p>
			<p>Item 21</p>
			<p>Item 22</p>
			<p>Item 23</p>
			<p>Item 24</p>
			<p>Item 25</p>
			<p>Item 26</p>
			<p>Item 27</p>
			<p>Item 28</p>
			<p>Item 29</p>
			<p>Item 30</p>
			<p>Item 31</p>
			<p>Item 32</p>
			<p>Item 33</p>
			<p>Item 34</p>
			<p>Item 35</p>
			<p>Item 36</p>
			<p>Item 37</p>
			<p>Item 38</p>
			<p>Item 39</p>
			<p>Item 40</p>
			<p>Item 41</p>
			<p>Item 42</p>
			<p>Item 43</p>
			<p>Item 44</p>
			<p>Item 45</p>
			<p>Item 46</p>
			<p>Item 47</p>
			<p>Item 48</p>
			<p>Item 49</p>
			<p>Item 50</p>
			<p>Item 51</p>
			<p>Item 52</p>
			<p>Item 53</p>
			<p>Item 54</p>
			<p>Item 55</p>
			<p>Item 56</p>
			<p>Item 57</p>
			<p>Item 58</p>
			<p>Item 59</p>
			<p>Item 60</p>
			<p>Item 61</p>
			<p>Item 62</p>
			<p>Item 63</p>
			<p>Item 64</p>
			<p>Item 65</p>
			<p>Item 66</p>
			<p>Item 67</p>
			<p>Item 68</p>
			<p>Item 69</p>
			<p>Item 70</p>
			<button onClick={() => (browsing = false)}>Close</button>
		</native.sheet>
	</main>
}
