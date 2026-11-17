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
	public let styles: [String: ResolvedStyle]
	public let viewport: (width: Double, height: Double)
	/// Device pixels per point the frames were laid out for; a screen with another scale is refused.
	public let dpr: Double
	public let fontFiles: [(id: String, file: String)]
}

extension StyleExport {
	/// Pairs every payload node with its export node. Export nodes the payload does not name (Dragon's `html`, `body`) paint
	/// nothing and only offset their children; a payload node the export lacks, or a write this host cannot express, is an error.
	public func resolve(for payload: NativeViewPayload, initialTexts: [(node: String, text: String)]) throws -> StyleLayout {
		let byId = Dictionary(uniqueKeysWithValues: nodes.map { ($0.id, $0) })
		let payloadIds = Set(payload.nodes.map(\.id))
		let texts = Dictionary(uniqueKeysWithValues: initialTexts.map { ($0.node, $0.text) })
		var styles: [String: ResolvedStyle] = [:]
		for node in payload.nodes {
			if case .branch = node { throw styleError("\(node.id): @if is not styled on iOS yet, the style export lays out one state") }
			guard let styled = byId[node.id] else { throw styleError("no style export node for \(node.id)") }
			switch node {
			case .element:
				guard !styled.isText, !styled.isAnonymous else { throw styleError("\(node.id) is an element in the payload but not in the style export") }
			case .branch: break
			case .text:
				guard styled.isText else { throw styleError("\(node.id) is text in the payload and an element in the style export") }
				guard styled.text == texts[node.id] else {
					throw styleError("\(node.id) reads \(texts[node.id].map { "\"\($0)\"" } ?? "nothing") but the style export laid out \(styled.text.map { "\"\($0)\"" } ?? "nothing")")
				}
			}
			var offset = (x: 0.0, y: 0.0)
			var cursor = styled.parent
			while let id = cursor, !payloadIds.contains(id) {
				guard let skipped = byId[id] else { throw styleError("\(node.id)'s style parent \(id) is missing") }
				offset.x += skipped.frame?.x ?? 0
				offset.y += skipped.frame?.y ?? 0
				cursor = skipped.parent
			}
			guard cursor == node.parent else {
				throw styleError("\(node.id)'s parent is \(node.parent ?? "none") in the payload, \(cursor ?? "none") in the style export")
			}
			var style = try resolve(styled, styled.writes)
			if let frame = style.frame {
				style.frame = Frame(x: frame.x + offset.x / dpr, y: frame.y + offset.y / dpr, width: frame.width, height: frame.height)
			}
			styles[node.id] = style
		}
		return StyleLayout(styles: styles, viewport: viewport, dpr: dpr, fontFiles: fonts)
	}

	private func resolve(_ node: StyleNode, _ writes: [StyleWrite]) throws -> ResolvedStyle {
		var style = ResolvedStyle()
		style.frame = node.frame.map { Frame(x: $0.x / dpr, y: $0.y / dpr, width: $0.width / dpr, height: $0.height / dpr) }
		var borderStyles: [String] = []
		var borderColors: [RGBA] = []
		for write in writes {
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
