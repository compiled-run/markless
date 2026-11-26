import Foundation

// Factored states (dragon.native-style-export/2): a page whose states Dragon splits into groups ships the page's table, each
// group's (only the nodes it owns), and their product; the host shows a combination as Dragon's state-groups.ts composes it.

public let dragonStyleExportGroupsSchema = "dragon.native-style-export/2"

/// A list whose items are made on first read and kept: a factored page has thousands of combinations, a host shows a few.
/// A list made from an array holds it as it is.
public struct LazyList<Element>: RandomAccessCollection, ExpressibleByArrayLiteral {
	private final class Made {
		let lock = NSRecursiveLock()
		var items: [Element?]
		let make: (Int) throws -> Element

		init(count: Int, make: @escaping (Int) throws -> Element) {
			items = Array(repeating: nil, count: count)
			self.make = make
		}
	}

	private enum Store {
		case eager([Element])
		case lazy(Made)
	}

	private let store: Store
	public let count: Int

	public init(_ items: [Element]) {
		store = .eager(items)
		count = items.count
	}

	public init(arrayLiteral elements: Element...) { self.init(elements) }

	public init(count: Int, _ make: @escaping (Int) throws -> Element) {
		store = .lazy(Made(count: count, make: make))
		self.count = count
	}

	public var startIndex: Int { 0 }
	public var endIndex: Int { count }

	/// The item at `index`, made now if it was not yet; a failure to make it is thrown and nothing is kept.
	public func element(_ index: Int) throws -> Element {
		switch store {
		case let .eager(items): return items[index]
		case let .lazy(made):
			made.lock.lock()
			defer { made.lock.unlock() }
			if let item = made.items[index] { return item }
			let item = try made.make(index)
			made.items[index] = item
			return item
		}
	}

	public subscript(index: Int) -> Element {
		precondition(index >= 0 && index < count, "entry \(index) of \(count)")
		do { return try element(index) } catch { fatalError("Markless iOS host: \(error)") }
	}
}

extension LazyList: @unchecked Sendable where Element: Sendable {}

/// What one table shows: its nodes (a group's, only those it owns), the laid-out children of the parents `order` names in their
/// order, and its root paint.
struct TableShown {
	let nodes: [StyleNode]
	let order: [String: [String]]
	let canvas: RGBA?
	let body: RGBA?
}

/// A slim interaction state: the nodes it changes, the ids it has no node for, a parent's children it adds to, its root paint if its own.
struct SlimState {
	let nodes: [StyleNode]
	let removed: Set<String>
	let order: [String: [String]]
	let canvas: RGBA?
	let body: RGBA?
	let ownBody: Bool
}

/// A table in one of its interaction states (state-groups.ts shownState).
func shownState(_ base: TableShown, _ state: SlimState) -> TableShown {
	let changed = Dictionary(state.nodes.map { ($0.id, $0) }, uniquingKeysWith: { _, b in b })
	let kept = base.nodes.filter { !state.removed.contains($0.id) }.map { changed[$0.id] ?? $0 }
	let have = Set(kept.map(\.id))
	return TableShown(
		nodes: kept + state.nodes.filter { !have.contains($0.id) }, order: base.order.merging(state.order) { _, b in b },
		canvas: state.canvas ?? base.canvas, body: state.ownBody ? state.body : base.body)
}

/// One order holding every list's ids in each list's order (state-groups.ts mergedOrder); two lists ordering ids both ways fail.
func mergedOrder(_ lists: [[String]]) throws -> [String] {
	var keys: [String] = []
	var after: [String: [String]] = [:]
	for list in lists {
		for (i, id) in list.enumerated() {
			if after[id] == nil {
				after[id] = []
				keys.append(id)
			}
			if i > 0, !after[id]!.contains(list[i - 1]) { after[id]!.append(list[i - 1]) }
		}
	}
	var out: [String] = []
	var placed = Set<String>()
	func place(_ id: String, _ path: [String]) throws {
		if placed.contains(id) { return }
		if path.contains(id) {
			throw PayloadError(path: "style", reason: "the tables of a factored page order \(id) both before and after \(path.last!)")
		}
		for before in after[id]! { try place(before, path + [id]) }
		placed.insert(id)
		out.append(id)
	}
	for id in keys { try place(id, []) }
	return out
}

/// The nodes of a combination (state-groups.ts composedNodes): a node from the table that owns it (`owner`, 0 the page's), each
/// parent's children in the order every table gives them, laid-out ones first, then the boxless ones as the tables list them.
func composedNodes(_ shown: [TableShown], owner: (String) -> Int) throws -> [StyleNode] {
	let byId = shown.map { t in Dictionary(t.nodes.map { ($0.id, $0) }, uniquingKeysWith: { _, b in b }) }
	let laid = shown.map { t -> [String?: [String]] in
		var lists = Dictionary(grouping: t.nodes.filter { $0.frame != nil }, by: \.parent).mapValues { $0.map(\.id) }
		for (parent, ids) in t.order { lists[parent] = ids }
		return lists
	}
	let boxless = shown.map { t in Dictionary(grouping: t.nodes.filter { $0.frame == nil }, by: \.parent).mapValues { $0.map(\.id) } }
	func own(_ id: String) -> StyleNode? {
		let k = owner(id)
		return byId.indices.contains(k) ? byId[k][id] : nil
	}
	var out: [StyleNode] = []
	var seen = Set<String>()
	func visit(_ parent: String?, _ laidOut: Bool) throws {
		for id in try mergedOrder(shown.indices.map { k in (laidOut ? laid[k][parent] : boxless[k][parent]) ?? [] }) {
			guard let n = own(id), n.parent == parent, !seen.contains(id), (n.frame != nil) == laidOut else { continue }
			seen.insert(id)
			out.append(n)
			try visit(id, laidOut)
		}
	}
	try visit(nil, true)
	for (k, t) in shown.enumerated() {
		for n in t.nodes where !seen.contains(n.id) && n.frame == nil && owner(n.id) == k {
			seen.insert(n.id)
			out.append(n)
		}
	}
	return try restacked(out)
}

// The order of a stacking context's layer items (Dragon's lower/paint/stacking.ts): z < 0, the normal-flow layers, z auto and 0, z > 0, the top layer.
private let layerClass = ["negative": 0, "normal-flow": 1, "positioned": 1, "positive": 2, "top-layer": 3]

/// A combination's paint order: each host's layer items sorted by layer, z-index and tree order, and ranked again.
func restacked(_ nodes: [StyleNode]) throws -> [StyleNode] {
	typealias Order = (host: String, bucket: Int, rank: Int, layer: String?, z: Double?)
	var hosts: [String] = []
	var items: [String: [(at: Int, id: String, order: Order)]] = [:]
	for (at, n) in nodes.enumerated() {
		guard let order = n.writes.lazy.compactMap({ w -> Order? in
			if case let .paintOrder(host, bucket, rank, layer, z) = w { return (host, bucket, rank, layer, z) } else { return nil }
		}).first else { continue }
		guard order.layer != nil else { throw PayloadError(path: "style", reason: "\"\(n.id)\"'s paint order has no layer, which a factored page's combination sorts by") }
		if items[order.host] == nil {
			items[order.host] = []
			hosts.append(order.host)
		}
		items[order.host]!.append((at, n.id, order))
	}
	if items.isEmpty { return nodes }
	func key(_ o: Order) -> (Int, Double) {
		let second: Double
		switch o.layer {
		case "normal-flow": second = -1
		case "negative", "positive": second = o.z ?? 0
		default: second = 0
		}
		return (layerClass[o.layer ?? ""] ?? 3, second)
	}
	var ranked: [String: StyleWrite] = [:]
	for host in hosts {
		let sorted = items[host]!.sorted { a, b in
			let ka = key(a.order), kb = key(b.order)
			if ka.0 != kb.0 { return ka.0 < kb.0 }
			if ka.1 != kb.1 { return ka.1 < kb.1 }
			return a.at < b.at
		}
		for (k, item) in sorted.enumerated() {
			let o = item.order
			ranked[item.id] = .paintOrder(host: o.host, bucket: o.bucket, rank: k, layer: o.layer, z: o.z)
		}
	}
	return nodes.map { n in
		guard let order = ranked[n.id] else { return n }
		return n.with(writes: n.writes.map { if case .paintOrder = $0 { return order } else { return $0 } })
	}
}

extension StyleNode {
	/// The node with other writes, its geometry kept.
	func with(writes: [StyleWrite]) -> StyleNode {
		var node = StyleNode(
			id: id, parent: parent, isText: isText, isAnonymous: isAnonymous, text: text, frame: frame, borderWidths: borderWidths, writes: writes,
			borderOps: borderOps, scrollRange: scrollRange, lines: lines)
		node.selectArrow = selectArrow
		node.checkboxMarks = checkboxMarks
		node.textAreaLines = textAreaLines
		return node
	}
}
