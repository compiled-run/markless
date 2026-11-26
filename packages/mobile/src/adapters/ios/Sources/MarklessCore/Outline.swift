/// A box's `outline` and what Dragon's translated ring and side painters (paint-radius.ts, paint-dash.ts) read to draw it as
/// Chrome does, with the view it is drawn in: after that view's flow children and before the boxes its stacking context paints
/// later (Chrome's outline phase of the paint layer).
public struct OutlinePaint: Equatable, Sendable {
	public struct RadiusLength: Equatable, Sendable {
		public let percent: Bool
		public let value: Double
	}

	public let style: String
	/// CSS px at zoom 1.
	public let width: Double
	public let offset: Double
	/// The colours the side painter names by index: the outline colour, then a 3D style's lighter and darker ones.
	public let tones: [RGBA]
	/// The box in page device px: its snapped border box (left, top, right, bottom), its size before snapping, its border widths
	/// (top, right, bottom, left) and its eight corner radius lengths.
	public let edges: [Double]
	public let size: [Double]
	public let borders: [Double]
	public let radii: [RadiusLength]
	/// The view node it is drawn in, or `OutlinePaint.page`, and that node's unsnapped page device px origin, which its view sits at.
	public let host: String
	public let hostX: Double, hostY: Double
	/// Its place among the outlines drawn in `host`: each box's descendants' outlines before its own, boxes in tree order.
	public let order: Int
	public let dpr: Double

	public var color: RGBA { tones[0] }

	/// The host of an outline the page's root stacking context paints over every top-level box: the page's own view.
	public static let page = ""
}

extension StyleExport {
	/// The outline of `node`, drawn in its layer's view or the page's top view; one that view would clip or misorder is refused.
	func outline(
		of node: StyleNode, byId: [String: StyleNode], nodes: [StyleNode], isView: (String) -> Bool, postOrder: [String: Int],
		pageHoldsMany: Bool
	) throws -> OutlinePaint? {
		guard let write = node.writes.lazy.compactMap({ write -> Outline? in
			if case let .outline(o) = write { return o }
			return nil
		}).first, let frame = node.frame else { return nil }
		func ancestors(_ n: StyleNode) -> [StyleNode] {
			var out: [StyleNode] = []
			var cursor = n.parent
			while let id = cursor, let p = byId[id] {
				out.append(p)
				cursor = p.parent
			}
			return out
		}
		// Where `stackingParent` places a box the layer paints later.
		func layerView(above n: StyleNode) -> String? {
			isView(write.layer) ? write.layer : pageHoldsMany ? OutlinePaint.page : ancestors(n).last(where: { isView($0.id) })?.id
		}
		let chain = [node] + ancestors(node)
		guard var host = isView(write.layer) ? write.layer : chain.last(where: { isView($0.id) })?.id else {
			throw styleError("\(node.id): its outline has no view to be drawn in")
		}
		guard var hostIndex = chain.firstIndex(where: { $0.id == host }) else { throw styleError("\(node.id): its outline's layer \(write.layer) is not around it") }
		if !isView(write.layer), pageHoldsMany {
			// The root stacking context paints its outlines after all its boxes, so a later top-level box does not cover it.
			host = OutlinePaint.page
			hostIndex = chain.count - 1
		}
		for box in chain[(hostIndex == 0 ? 0 : 1)...hostIndex] {
			// A box drawing its own outline clips its children in a clip view beside it, so only its clip-path or scroll view would cut it.
			let own = box.id == node.id && host == node.id
			let clips = box.writes.contains {
				switch $0 {
				case .paddingBoxClip: return !own
				case .clipPathInset, .scrollContainer: return true
				default: return false
				}
			}
			if clips { throw styleError("\(node.id): its outline is drawn in \(host), past \(box.id), which clips or scrolls; not implemented on iOS") }
		}
		for item in nodes where item.frame != nil && item.writes.contains(where: {
			if case let .paintOrder(h, bucket, _) = $0 { return h == write.layer && bucket >= 1 } else { return false }
		}) {
			let parent = item.id.contains("@") ? ancestors(item).first(where: { isView($0.id) })?.id : layerView(above: item)
			if (parent ?? OutlinePaint.page) != host {
				throw styleError("\(node.id): its outline is drawn in \(host), but \(item.id), which \(write.layer) paints over outlines, is placed in \(parent ?? "the page"); not implemented on iOS")
			}
		}
		func origin(_ id: String?) -> (x: Double, y: Double) {
			guard let id, let n = byId[id] else { return (0, 0) }
			let p = origin(n.parent)
			return (p.x + (n.frame?.x ?? 0), p.y + (n.frame?.y ?? 0))
		}
		let at = origin(node.id), hostAt = origin(host)
		let w = node.borderWidths
		guard let order = postOrder[node.id] else { throw styleError("\(node.id) has no place in the export's tree") }
		return OutlinePaint(
			style: write.style, width: write.width, offset: write.offset,
			tones: write.tones.map { [write.color, $0.light, $0.dark] } ?? [write.color, write.color, write.color],
			edges: [at.x.rounded(), at.y.rounded(), (at.x + frame.width).rounded(), (at.y + frame.height).rounded()],
			size: [frame.width, frame.height], borders: w.map { [$0.top, $0.right, $0.bottom, $0.left] } ?? [0, 0, 0, 0],
			radii: write.radii?.map { OutlinePaint.RadiusLength(percent: $0.percent, value: $0.value) }
				?? Array(repeating: OutlinePaint.RadiusLength(percent: false, value: 0), count: 8),
			host: host, hostX: hostAt.x, hostY: hostAt.y, order: order, dpr: dpr)
	}

	/// Each export node's place in a post-order walk of the tree: a box after its descendants, siblings in tree order.
	static func postOrder(_ nodes: [StyleNode]) -> [String: Int] {
		var children: [String: [String]] = [:]
		var roots: [String] = []
		let ids = Set(nodes.map(\.id))
		for n in nodes {
			if let p = n.parent, ids.contains(p) { children[p, default: []].append(n.id) } else { roots.append(n.id) }
		}
		var out: [String: Int] = [:]
		func visit(_ id: String) {
			for c in children[id] ?? [] { visit(c) }
			out[id] = out.count
		}
		for r in roots { visit(r) }
		return out
	}
}
