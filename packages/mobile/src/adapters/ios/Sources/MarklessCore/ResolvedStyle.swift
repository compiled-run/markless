/// One box's look in points, ready for a host to assign: the only arithmetic between Dragon's export and the views.
public struct ResolvedStyle: Equatable, Sendable {
	public var frame: Frame?
	public var background: RGBA?
	public var borderWidth: Double = 0
	public var borderColor: RGBA?
	public var cornerRadius: Double = 0
	public var font: (family: String, size: Double)?
	public var textColor: RGBA?

	public static func == (a: ResolvedStyle, b: ResolvedStyle) -> Bool {
		a.frame == b.frame && a.background == b.background && a.borderWidth == b.borderWidth && a.borderColor == b.borderColor
			&& a.cornerRadius == b.cornerRadius && a.font?.family == b.font?.family && a.font?.size == b.font?.size
			&& a.textColor == b.textColor
	}
}

public struct StyleLayout: Sendable {
	/// Boxes Dragon laid out above the component's root (`html`, `body`), outermost first.
	public let wrappers: [(id: String, style: ResolvedStyle)]
	public let styles: [String: ResolvedStyle]
	public let viewport: (width: Double, height: Double)
	/// Device pixels per point the frames were laid out for; a screen with another scale is refused.
	public let dpr: Double
	public let fontFiles: [(id: String, file: String)]
}

extension StyleExport {
	/// Pairs every payload node with its export node; a node either side lacks, or a write this host cannot express, is an error.
	public func resolve(for payload: NativeViewPayload, initialTexts: [(node: String, text: String)]) throws -> StyleLayout {
		if let anonymous = nodes.first(where: \.isAnonymous) {
			throw styleError("\(anonymous.id): anonymous boxes are not implemented on iOS")
		}
		let byId = Dictionary(uniqueKeysWithValues: nodes.map { ($0.id, $0) })
		let payloadIds = Set(payload.nodes.map(\.id))
		let texts = Dictionary(uniqueKeysWithValues: initialTexts.map { ($0.node, $0.text) })
		var styles: [String: ResolvedStyle] = [:]
		var wrapperIds: [String]?
		for node in payload.nodes {
			guard let styled = byId[node.id] else { throw styleError("no style export node for \(node.id)") }
			switch node {
			case .element:
				guard !styled.isText else { throw styleError("\(node.id) is an element in the payload and text in the style export") }
			case .text:
				guard styled.isText else { throw styleError("\(node.id) is text in the payload and an element in the style export") }
				guard styled.text == texts[node.id] else {
					throw styleError("\(node.id) reads \(texts[node.id].map { "\"\($0)\"" } ?? "nothing") but the style export laid out \(styled.text.map { "\"\($0)\"" } ?? "nothing")")
				}
			}
			if let parent = node.parent {
				guard styled.parent == parent else { throw styleError("\(node.id)'s parent is \(parent) in the payload, \(styled.parent ?? "none") in the style export") }
			} else {
				var chain: [String] = []
				var cursor = styled.parent
				while let id = cursor {
					guard let wrapper = byId[id], !payloadIds.contains(id), !wrapper.isText else { throw styleError("\(node.id) sits under \(id) in the style export") }
					chain.insert(id, at: 0)
					cursor = wrapper.parent
				}
				guard wrapperIds == nil || wrapperIds == chain else { throw styleError("payload roots sit under different style export boxes") }
				wrapperIds = chain
			}
			styles[node.id] = try resolve(styled)
		}
		let wrappers = wrapperIds ?? []
		if let extra = nodes.first(where: { !payloadIds.contains($0.id) && !wrappers.contains($0.id) }) {
			throw styleError("style export node \(extra.id) has no payload node")
		}
		return StyleLayout(
			wrappers: try wrappers.map { (id: $0, style: try resolve(byId[$0]!)) }, styles: styles,
			viewport: viewport, dpr: dpr, fontFiles: fonts)
	}

	private func resolve(_ node: StyleNode) throws -> ResolvedStyle {
		var style = ResolvedStyle()
		style.frame = node.frame.map { Frame(x: $0.x / dpr, y: $0.y / dpr, width: $0.width / dpr, height: $0.height / dpr) }
		var borderStyles: [String] = []
		var borderColors: [RGBA] = []
		for write in node.writes {
			switch write {
			case let .backgroundColor(color): style.background = color
			case .borderWidths: break
			case let .borderStyles(styles): borderStyles = styles
			case let .borderColors(colors): borderColors = colors
			case let .borderRadius(lengths):
				guard lengths.allSatisfy({ !$0.percent && $0.value == lengths[0].value }) else {
					throw styleError("\(node.id): only one uniform pixel corner radius is implemented on iOS")
				}
				style.cornerRadius = lengths[0].value
			case let .font(family, size): style.font = (family, size)
			case let .textColor(color): style.textColor = color
			case .syntheticBold: throw styleError("\(node.id): synthetic-bold is not implemented on iOS")
			}
		}
		if let widths = node.borderWidths {
			let all = [widths.top, widths.right, widths.bottom, widths.left]
			if all.contains(where: { $0 != 0 }) {
				guard borderStyles == ["solid", "solid", "solid", "solid"] else {
					throw styleError("\(node.id): border styles \(borderStyles) are not implemented on iOS, only four solid sides")
				}
				guard all.allSatisfy({ $0 == all[0] }), borderColors.count == 4, borderColors.allSatisfy({ $0 == borderColors[0] }) else {
					throw styleError("\(node.id): only a border with one width and one colour on every side is implemented on iOS")
				}
				style.borderWidth = all[0] / dpr
				style.borderColor = borderColors[0]
			}
		}
		return style
	}
}

private func styleError(_ reason: String) -> PayloadError { PayloadError(path: "style", reason: reason) }
