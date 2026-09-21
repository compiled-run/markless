export type Scenario = 'case-file' | 'rulebook' | 'road-trip';
export type Treatment = 'B' | 'C';
export type Entry = { value: string; title: string; recap?: string; text: string; art?: number; done?: boolean; lines?: readonly string[]; };
export const scenarios: readonly { id: Scenario; label: string; title: string; subtitle: string; brand: string; note: string; left: string; right: string; preferred: Treatment; entries: readonly Entry[] }[] = [
 { id: 'road-trip', label: 'Road trip', title: 'Road trip: Lisbon to Porto', subtitle: 'Five days along the coast.', brand: 'My trips', note: 'Keep more than one day open.', left: 'Good trips happen here.', right: 'Same coast, new stories.', preferred: 'C', entries: [
  { value: 'lisbon', title: 'Day 1 · Lisbon', recap: 'Pastéis and three tram rides', done: true, text: 'A slow morning in Alfama, warm pastéis in Belém, and one last tram ride as the lights came on.', art: 0 },
  { value: 'sintra', title: 'Day 2 · Sintra', recap: 'The palace was closed, the forest was not', done: true, text: 'Follow the shaded forest paths, bring a picnic, and leave time for a quiet walk back into town.' },
  { value: 'nazare', title: 'Day 3 · Nazaré', recap: 'today', text: '', lines: ['10:00|Watch the big waves from the fort', '13:00|Grilled sardines at the harbour', '16:00|Drive on to Coimbra'], art: 3 },
  { value: 'coimbra', title: 'Day 4 · Coimbra', recap: 'Books, gardens, and a little fado', text: 'Visit the university in the morning. Wander through the botanical garden, then find a small place for dinner.' },
  { value: 'porto', title: 'Day 5 · Porto', text: 'Book: Livraria Lello tickets' },
 ]},
 { id: 'case-file', label: 'Case file', title: 'Case file: the missing sourdough starter', subtitle: 'Read every alibi, then name the culprit.', brand: 'The Daily Loaf', note: 'Read each alibi to unlock the final choice.', left: 'Good bread deserves a few questions.', right: 'Same ingredients. Different suspects.', preferred: 'B', entries: [
  { value: 'marguerite', title: 'Marguerite, the pastry chef', art: 0, text: 'I was folding croissants at dawn. The starter was still on the shelf — but someone had left the window open.' },
  { value: 'otto', title: 'Otto, the night baker', art: 1, text: 'I was proving the rye until two.\nThe starter was on the shelf when I left.\nAsk the cat.' },
  { value: 'pip', title: 'Pip, the delivery rider', art: 2, text: 'I delivered the flour, not the starter. I did see a black-and-white tail disappear behind the warm oven.' },
  { value: 'bruno', title: 'Bruno, the shop cat', art: 3, text: 'Mrrp. The shelf was cold. The oven was warm. Your jar is behind it. You are welcome.' },
 ]},
 { id: 'rulebook', label: 'Moon Goats', title: 'Rulebook: Moon Goats', subtitle: 'Learn the rules, gather your herd, and head for the crater.', brand: 'Moon Goats', note: 'Find a rule, even inside a closed section.', left: 'A lighter game for darker skies.', right: 'Same rules. More goats.', preferred: 'C', entries: [
  { value: 'setup', title: 'Setup', text: 'Give each player five goats. Place the crater in the middle of the board. The player with the smallest herd goes first.' },
  { value: 'turn', title: 'Your turn', text: 'Roll both dice. Move one goat that many spaces, or split the steps between two goats. Land beside a friend to form a herd.' },
  { value: 'scoring', title: 'Scoring', text: 'You earn 1 point for each goat in your largest herd.\nIf two herds tie, the goat closest to the crater wins the round.\nMost points after 5 rounds wins the game.' },
  { value: 'edge', title: 'Edge cases', text: 'A goat may share a space with another goat. If the crater is full, stop on the nearest free space. A roll that carries you off the moon ends at the edge.' },
 ]},
];
