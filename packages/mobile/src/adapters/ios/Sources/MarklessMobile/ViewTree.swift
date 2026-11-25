#if canImport(UIKit)
import AVFoundation
import CoreText
import MarklessCore
import UIKit
import UIKit.UIGestureRecognizerSubclass
import WebKit

private let headings: Set<String> = ["h1", "h2", "h3", "h4", "h5", "h6"]
private let unimplementedElements: Set<String> = [
	"canvas", "embed", "object",
	"picture", "video",
]

/// Where an instance is built: its row (`@key`, empty outside lists), the names its expressions see, and what encloses it.
private struct Context {
	var suffix = ""
	var scope = NativeScope.empty
	var button: UIButton?
	var heading = false
	/// The text look the browser's default stylesheet gives what is inside (bold headings, monospace `<pre>`).
	var look = TextLook()
}

/// Text properties a block's or a phrase element's default style passes to the text inside it.
struct TextLook: Equatable {
	var bold = false
	var italic = false
	var monospace = false
	var scale: CGFloat = 1
	var line: String?
	var shift: String?
	var highlight = false
	var preformatted = false
	/// Inside a `<center>`: blocks sit in the middle of the line and text is centred (`text-align: -webkit-center`).
	var centered = false

	func applying(_ style: NativeDefaultStyle?) -> TextLook {
		guard let style else { return self }
		var next = self
		next.bold = bold || style.bold
		next.italic = italic || style.italic
		next.monospace = monospace || style.monospace
		next.scale = scale * CGFloat(style.size ?? 1)
		next.line = style.line ?? line
		next.shift = style.shift ?? shift
		next.highlight = highlight || style.highlight
		next.preformatted = preformatted || style.preformatted
		next.centered = centered || style.center
		return next
	}

	/// The label font size the stacking layout starts from (UILabel's own).
	static let baseSize: CGFloat = 17

	var attributes: [NSAttributedString.Key: Any] {
		let size = TextLook.baseSize * scale
		var font = monospace
			? UIFont.monospacedSystemFont(ofSize: size, weight: bold ? .bold : .regular)
			: UIFont.systemFont(ofSize: size, weight: bold ? .bold : .regular)
		if italic, let descriptor = font.fontDescriptor.withSymbolicTraits(font.fontDescriptor.symbolicTraits.union(.traitItalic)) {
			font = UIFont(descriptor: descriptor, size: size)
		}
		var attributes: [NSAttributedString.Key: Any] = [.font: font]
		if line == "underline" { attributes[.underlineStyle] = NSUnderlineStyle.single.rawValue }
		if line == "line-through" { attributes[.strikethroughStyle] = NSUnderlineStyle.single.rawValue }
		if shift == "super" { attributes[.baselineOffset] = TextLook.baseSize * 0.33 }
		if shift == "sub" { attributes[.baselineOffset] = -TextLook.baseSize * 0.2 }
		if highlight {
			attributes[.backgroundColor] = UIColor.yellow
			attributes[.foregroundColor] = UIColor.black
		}
		return attributes
	}
}

/// One paragraph of the stacking layout: a run of text nodes and phrase elements shown as one label.
@MainActor
final class Paragraph {
	/// The run's templates, in order.
	let nodes: [String]
	/// The row suffix of this instance (`@key`, or empty).
	let suffix: String
	let look: TextLook
	let label: UILabel
	/// The label, or the sideways scroller around it for preformatted text.
	let view: UIView
	init(nodes: [String], suffix: String, look: TextLook, label: UILabel, view: UIView) {
		self.nodes = nodes
		self.suffix = suffix
		self.look = look
		self.label = label
		self.view = view
	}
}

/// A `<pre>` paragraph's sideways scroller: its line is never wrapped.
final class PreformattedScroll: UIScrollView {}

/// The page's scroll view: a drag that starts on a button or field scrolls the page, as it does in Safari; a tap still presses it.
final class PageScroll: UIScrollView {
	override func touchesShouldCancel(in view: UIView) -> Bool { true }

	/// A touch goes to the box drawn on top, as a browser's does: siblings by zPosition (a positioned or sticky box over the flow
	/// after it), later ones first, where UIKit's own walk goes by subview order alone.
	override func hitTest(_ point: CGPoint, with event: UIEvent?) -> UIView? {
		guard isUserInteractionEnabled, !isHidden, alpha > 0.01, self.point(inside: point, with: event) else { return nil }
		return PageScroll.topmost(in: self, at: point, with: event) ?? self
	}

	private static func topmost(in view: UIView, at point: CGPoint, with event: UIEvent?) -> UIView? {
		let order = view.subviews.enumerated().sorted { ($0.element.layer.zPosition, $0.offset) > ($1.element.layer.zPosition, $1.offset) }
		for (_, child) in order {
			let p = child.convert(point, from: view)
			if type(of: child) == UIView.self {
				guard child.isUserInteractionEnabled, !child.isHidden, child.alpha > 0.01 else { continue }
				if let hit = topmost(in: child, at: p, with: event) { return hit }
				if child.point(inside: p, with: event) { return child }
			} else if let hit = child.hitTest(p, with: event) {
				return hit
			}
		}
		return nil
	}
}

/// An inline `<svg>`: draws the shapes compiled when the app was built, then the shapes inside it that come from components,
/// whose outline the engine gives while the app runs, fitted into its box as the web fits the viewBox.
final class DrawingView: UIView {
	let drawing: NativeDrawing
	var currentColor: UIColor = .black { didSet { setNeedsDisplay() } }
	/// min-x, min-y, width and height: the compiled one, or what a `viewBox` that follows state gives.
	private(set) var viewBox: [Double]?
	/// Shapes from inside it, in tree order, each with the outline it has now.
	private var live: [(id: String, shape: NativeShape, path: [Double])] = []

	init(_ drawing: NativeDrawing) {
		self.drawing = drawing
		viewBox = drawing.viewBox
		super.init(frame: .zero)
		isOpaque = false
		backgroundColor = .clear
		contentMode = .redraw
	}

	@available(*, unavailable)
	required init?(coder: NSCoder) { fatalError("DrawingView is made in code") }

	override func draw(_ rect: CGRect) {
		guard let context = UIGraphicsGetCurrentContext() else { return }
		if let box = viewBox?.map({ CGFloat($0) }), box.count == 4, box[2] > 0, box[3] > 0 {
			// SVG 2 §8.5: the viewBox placed in the box by preserveAspectRatio, xMidYMid meet when it has none.
			switch drawing.aspect {
			case .none?:
				context.scaleBy(x: bounds.width / box[2], y: bounds.height / box[3])
				context.translateBy(x: -box[0], y: -box[1])
			default:
				var (x, y, slice) = ("mid", "mid", false)
				if case let .align(ax, ay, sliced)? = drawing.aspect { (x, y, slice) = (ax, ay, sliced) }
				let fit = [bounds.width / box[2], bounds.height / box[3]]
				let scale = slice ? fit.max()! : fit.min()!
				let place = { (align: String, room: CGFloat) -> CGFloat in align == "min" ? 0 : align == "max" ? room : room / 2 }
				if slice { context.clip(to: bounds) }
				context.translateBy(
					x: -box[0] * scale + place(x, bounds.width - box[2] * scale), y: -box[1] * scale + place(y, bounds.height - box[3] * scale))
				context.scaleBy(x: scale, y: scale)
			}
		}
		for (shape, p) in drawing.shapes.map({ ($0, $0.path) }) + live.map({ ($0.shape, $0.path) }) {
			let path = Self.path(p)
			context.saveGState()
			for (index, clip) in shape.clip.enumerated() {
				context.addPath(Self.path(clip))
				context.clip(using: shape.clipEvenOdd.indices.contains(index) && shape.clipEvenOdd[index] ? .evenOdd : .winding)
			}
			// A blur draws the shape far off to the side and only its shadow, offset back, inside the filter region.
			var shadow: ((UIColor) -> UIColor)? = nil
			if let blur = shape.blur {
				context.addPath(Self.path(blur.region))
				context.clip(using: .winding)
				let ctm = context.ctm, scale = contentScaleFactor, far: CGFloat = 100_000
				let linear = CGAffineTransform(a: ctm.a, b: ctm.b, c: ctm.c, d: ctm.d, tx: 0, ty: 0)
				let shift = CGPoint(x: far, y: 0).applying(linear.inverted())
				let sigma = blur.deviation * sqrt(abs(ctm.a * ctm.d - ctm.b * ctm.c))
				context.translateBy(x: shift.x, y: shift.y)
				shadow = { paint in
					context.setShadow(offset: CGSize(width: -far / scale, height: 0), blur: 2 * sigma / scale, color: paint.cgColor)
					return .black
				}
			}
			if let t = shape.transform { context.concatenate(CGAffineTransform(a: t[0], b: t[1], c: t[2], d: t[3], tx: t[4], ty: t[5])) }
			if let text = shape.text {
				draw(text)
				context.restoreGState()
				continue
			}
			if let fill = shape.fill {
				context.addPath(path)
				if case let .gradient(gradient) = fill {
					context.saveGState()
					context.clip(using: shape.evenOdd ? .evenOdd : .winding)
					Self.draw(gradient, in: context)
					context.restoreGState()
				} else {
					context.setFillColor((shadow?(color(fill)) ?? color(fill)).cgColor)
					context.fillPath(using: shape.evenOdd ? .evenOdd : .winding)
				}
			}
			if let stroke = shape.stroke, shape.width > 0 {
				context.addPath(path)
				context.setLineWidth(shape.width)
				context.setLineCap(shape.cap == "round" ? .round : shape.cap == "square" ? .square : .butt)
				context.setLineJoin(shape.join == "round" ? .round : shape.join == "bevel" ? .bevel : .miter)
				context.setMiterLimit(shape.miterLimit)
				if let dash = shape.dash { context.setLineDash(phase: shape.dashOffset, lengths: dash.map { CGFloat($0) }) }
				if case let .gradient(gradient) = stroke {
					context.saveGState()
					context.replacePathWithStrokedPath()
					context.clip()
					Self.draw(gradient, in: context)
					context.restoreGState()
				} else {
					context.setStrokeColor((shadow?(color(stroke)) ?? color(stroke)).cgColor)
					context.strokePath()
				}
			}
			context.restoreGState()
		}
	}

	/// The engine's numbers, space-separated, as the journal carries them; nil or empty draws nothing.
	static func numbers(_ text: String?) -> [Double] {
		(text ?? "").split(separator: " ").compactMap { Double($0) }
	}

	func addShape(_ id: String, _ shape: NativeShape, outline: String?) {
		live.append((id, shape, shape.path.isEmpty ? Self.numbers(outline) : shape.path))
		setNeedsDisplay()
	}

	func setOutline(_ id: String, _ outline: String?) {
		guard let at = live.firstIndex(where: { $0.id == id }) else { return }
		live[at].path = Self.numbers(outline)
		setNeedsDisplay()
	}

	func setViewBox(_ text: String?) {
		let box = Self.numbers(text)
		viewBox = box.count == 4 ? box : nil
		setNeedsDisplay()
	}

	/// A verb-coded outline: 0 move x y, 1 line x y, 3 cubic x1 y1 x2 y2 x y, 4 close.
	private static func path(_ p: [Double]) -> CGMutablePath {
		let path = CGMutablePath()
		var i = 0
		while i < p.count {
			switch Int(p[i]) {
			case 0: path.move(to: CGPoint(x: p[i + 1], y: p[i + 2])); i += 3
			case 1: path.addLine(to: CGPoint(x: p[i + 1], y: p[i + 2])); i += 3
			case 3:
				path.addCurve(to: CGPoint(x: p[i + 5], y: p[i + 6]), control1: CGPoint(x: p[i + 1], y: p[i + 2]), control2: CGPoint(x: p[i + 3], y: p[i + 4]))
				i += 7
			case 4: path.closeSubpath(); i += 1
			default: i = p.count
			}
		}
		return path
	}

	/// Lays out an SVG `<text>`'s runs from the pen, each chunk placed by its anchor, as the browser lays them out.
	private func draw(_ text: NativeDrawingText) {
		typealias Piece = (string: NSAttributedString, width: CGFloat, font: UIFont, dy: CGFloat)
		var chunks: [(x: CGFloat, y: CGFloat, pieces: [Piece])] = []
		var pen = CGPoint.zero
		for run in text.runs {
			if run.x != nil || run.y != nil || chunks.isEmpty {
				pen = CGPoint(x: run.x.map { CGFloat($0) } ?? pen.x, y: run.y.map { CGFloat($0) } ?? pen.y)
				chunks.append((pen.x + CGFloat(run.dx ?? 0), pen.y + CGFloat(run.dy ?? 0), []))
				pen.x += CGFloat(run.dx ?? 0)
				pen.y += CGFloat(run.dy ?? 0)
			} else {
				pen.x += CGFloat(run.dx ?? 0)
				pen.y += CGFloat(run.dy ?? 0)
			}
			let font = Self.font(run)
			var attributes: [NSAttributedString.Key: Any] = [.font: font, .kern: run.letterSpacing]
			attributes[.foregroundColor] = run.fill.map(color) ?? UIColor.clear
			let string = NSAttributedString(string: run.text, attributes: attributes)
			let width = string.size().width
			chunks[chunks.count - 1].pieces.append((string, width, font, pen.y - chunks[chunks.count - 1].y))
			pen.x += width
		}
		for chunk in chunks {
			let total = chunk.pieces.reduce(0) { $0 + $1.width }
			var x = chunk.x - (text.anchor == "middle" ? total / 2 : text.anchor == "end" ? total : 0)
			for piece in chunk.pieces {
				let f = piece.font
				// Where the alphabetic baseline sits below the pen's y for each dominant-baseline, from the font's metrics.
				let shift: CGFloat = switch text.baseline {
				case "middle": f.xHeight / 2
				case "central": (f.ascender + f.descender) / 2
				case "hanging": f.ascender * 0.8
				case "text-top": f.ascender
				case "text-bottom", "ideographic": f.descender
				default: 0
				}
				// UIKit draws a string from the top of its line, the font's ascender above the baseline.
				piece.string.draw(at: CGPoint(x: x, y: chunk.y + piece.dy + shift - f.ascender))
				x += piece.width
			}
		}
	}

	private static func font(_ run: NativeDrawingText.Run) -> UIFont {
		let size = CGFloat(run.size)
		let weight: UIFont.Weight = switch run.weight {
		case ..<150: .ultraLight
		case ..<250: .thin
		case ..<350: .light
		case ..<450: .regular
		case ..<550: .medium
		case ..<650: .semibold
		case ..<750: .bold
		case ..<850: .heavy
		default: .black
		}
		switch run.family {
		case "monospace": return UIFont.monospacedSystemFont(ofSize: size, weight: weight)
		case "serif":
			let base = UIFont.systemFont(ofSize: size, weight: weight)
			return base.fontDescriptor.withDesign(.serif).map { UIFont(descriptor: $0, size: size) } ?? base
		default: return UIFont.systemFont(ofSize: size, weight: weight)
		}
	}

	private func color(_ paint: NativeShape.Paint) -> UIColor {
		switch paint {
		case .currentColor: currentColor
		case let .color(c): UIColor(red: c.r / 255, green: c.g / 255, blue: c.b / 255, alpha: c.alpha / 255)
		case .gradient: .clear
		}
	}

	/// Fills the clip with a gradient, padded past its ends, its colours blended in sRGB as the browser blends them.
	private static func draw(_ g: NativeGradient, in context: CGContext) {
		let components = g.stops.flatMap { [$0.color.r / 255, $0.color.g / 255, $0.color.b / 255, $0.color.alpha / 255].map { CGFloat($0) } }
		guard let space = CGColorSpace(name: CGColorSpace.sRGB),
			let gradient = CGGradient(colorSpace: space, colorComponents: components, locations: g.stops.map { CGFloat($0.offset) }, count: g.stops.count)
		else { return }
		if let t = g.transform { context.concatenate(CGAffineTransform(a: t[0], b: t[1], c: t[2], d: t[3], tx: t[4], ty: t[5])) }
		let pad: CGGradientDrawingOptions = [.drawsBeforeStartLocation, .drawsAfterEndLocation]
		if let l = g.linear {
			context.drawLinearGradient(gradient, start: CGPoint(x: l[0], y: l[1]), end: CGPoint(x: l[2], y: l[3]), options: pad)
		} else if let r = g.radial {
			context.drawRadialGradient(
				gradient, startCenter: CGPoint(x: r[0], y: r[1]), startRadius: r[2], endCenter: CGPoint(x: r[3], y: r[4]), endRadius: r[5],
				options: pad)
		}
	}
}

/// The retained views of one payload: built by the view factory, then changed only by `apply(_:)`.
@MainActor
final class ViewTree {
	let root = UIView()
	/// The page's own scroll view, as a browser's viewport: it fills the screen, insets its content by the safe areas and
	/// scrolls it under the bars.
	let page = PageScroll()
	let keyboard: KeyboardDismisser
	private let runtime: NativeRuntime
	private var layout: StyleLayout?
	private let faces: [String: UIFontDescriptor]
	/// The system faces the page's and its sheets' styles name.
	private let systemFaces: [String: SystemFace]
	private let onAction: (NativeAction) -> Void
	/// Runs a text field's `keydown` or `paste` and answers whether its handler called `preventDefault()`.
	private let ask: (NativeAction) -> Bool
	/// The view of a device object (a camera's preview), made by the page's device.
	private let objectView: (_ object: String, _ device: String) throws -> UIView
	/// The images the app packaged, by the src a page writes.
	private let images: [String: NativeImageAsset]
	private let nodes: [String: NativeNode]
	/// The nodes each element, root (`""`), branch arm (`branch#index`) or list row (`repeat id`) places directly.
	private let slots: [String: [String]]
	private let events: [String: [NativeEvent]]
	private(set) var elements: [String: UIView] = [:]
	/// Shapes inside an svg, by node: the drawing that draws each one.
	private var shapeOwners: [String: DrawingView] = [:]
	/// svgs whose viewBox follows state: the journal's `viewBox` attribute gives it.
	private var followingViewBox: Set<String> = []
	private(set) var labels: [String: UILabel] = [:]
	private var contexts: [String: Context] = [:]
	private var templates: [String: String] = [:]
	private var attributes: [String: [String: String]] = [:]
	private var branches: [String: (anchor: UIView, index: Int?, built: [String])] = [:]
	/// Timers the page set and has not fired or cleared, by the name its `timer` entries give.
	private var timers: [String: Task<Void, Never>] = [:]
	private var lists: [String: (anchor: UIView, keys: [String], built: [String: [String]])] = [:]
	private(set) var sheets: [String: SystemSheet] = [:]
	/// Sheets built since the last stacking pass, whose content an unstyled page still has to stack.
	private var unstacked: Set<String> = []
	/// POSX-s scroll: Dragon's `runMarklessSticky`, set by the controller; without it sticky boxes stay where the layout put them.
	var stickyShift: ((String) -> String)?
	private var stickyWatch: NSKeyValueObservation?
	/// Each sticky view's center as the layout placed it, and Dragon's shift for it at scroll offset 0 (already in that place).
	private var stickyRest: [String: (center: CGPoint, dx: Double, dy: Double)] = [:]
	/// The controller that presents the page's system sheets.
	weak var presenter: UIViewController?
	private var anchors = Set<ObjectIdentifier>()
	private(set) var assignment: Int
	/// The entry the page shows: its assignment, or the interaction state (`:active`, `:focus`) Dragon's runtime selects in it.
	private(set) var shown: Int
	/// Dragon's translated library cases (`DragonPlan.library`), which run `rt-interaction`; nil without Dragon's plan module.
	var library: ((String) -> String)?
	/// Called after a touch shows another entry, so the screen repaints its canvas and the layout dump follows.
	var onShown: (() -> Void)?
	/// Called after the page moves to another assignment or entry, so the host lays it out if it has not yet.
	var onEntries: (() -> Void)?
	/// The pointer steps since the page opened, by the node each names, replayed through the current level's tables.
	private var interactionSteps: [(op: String, node: String?)] = []
	/// The list row (`@<key>` of its copies) the finger is pressing, and the one the focused element is in: an interaction state
	/// styles only those rows' copies.
	private var pressedRow: String?
	private var focusedRow: String?
	private var interactionWatcher: InteractionWatcher?
	/// A finger is on the page: a restack moves no view until it lifts (`restack`).
	private var fingerDown = false
	/// A restack waited for the finger to lift, and runs once the touch is over.
	private var restackAfterTouch = false
	private let bodyLayer = CALayer()
	/// Each styled sheet's layout per resting height, the height it rests at, and each height's current assignment.
	private var sheetStyles: [String: (heights: [(snapPoint: Double, layout: StyleLayout)], height: Int, assignments: [Int])] = [:]
	/// The sheet each node inside a system sheet belongs to.
	private let sheetOf: [String: String]
	/// A tap on the page dismisses the keyboard; a stack makes it wait for its edge-swipe Back.
	let dismissGestures: [UIGestureRecognizer] = [UITapGestureRecognizer()]
	private var stackConstraints: [ObjectIdentifier: [NSLayoutConstraint]] = [:]
	private var forwards: [LabelForward] = []
	private var dialogIds = Set<String>()
	/// The stacking layout's paragraphs, by each text node and phrase element instance in them.
	private var paragraphs: [String: Paragraph] = [:]
	/// The current text of each text node instance shown in a paragraph.
	private var paragraphTexts: [String: String] = [:]
	/// Phrase element instances, which flow in a paragraph and have no view.
	private var flowing = Set<String>()
	/// Views the stacking layout sizes itself or never stacks into (a rule, a drawing, a list marker).
	private var leaves = Set<ObjectIdentifier>()
	/// Views stacked across their container's whole width.
	private var fullWidth = Set<ObjectIdentifier>()
	/// Start-side insets of blocks, in points.
	private var indents: [ObjectIdentifier: CGFloat] = [:]
	/// Lists and the marker kind their items show; each item's marker label.
	private var listMarkers: [ObjectIdentifier: String] = [:]
	private var itemMarkers: [ObjectIdentifier: UILabel] = [:]
	/// Containers whose children sit in the middle of the line (inside a `<center>`).
	private var centered: Set<ObjectIdentifier> = []
	/// Each summary's disclosure triangle, in its start inset.
	private var disclosures: [ObjectIdentifier: UILabel] = [:]
	/// Table structure: tables, their rows and the rows' cells.
	private var tables = Set<ObjectIdentifier>()
	private var tableRows = Set<ObjectIdentifier>()
	private var tableCells = Set<ObjectIdentifier>()
	private var columnConstraints: [ObjectIdentifier: [NSLayoutConstraint]] = [:]
	private var tableViews: [ObjectIdentifier: UIView] = [:]
	/// Views a container holds that the stacking layout does not place (a list marker, a rule's line).
	private var decorations = Set<ObjectIdentifier>()
	/// The open dialog's top layer and the place in the page its view returns to.
	private var topLayer: (layer: TopLayerView, home: UIView, index: Int)?
	/// The scroll view each scroll container hosts its children in.
	private var scrollViews: [String: ContainerScrollView] = [:]
	/// Each box's shadow layers, while it has a shadow.
	private var shadows: [String: ShadowLayers] = [:]
	/// Each outlined box's outline view, in the view of its outline's host.
	private var outlines: [String: OutlineView] = [:]
	/// The view each box that clips overflow past its borders hosts its children in.
	private var clipViews: [String: PaddingClipView] = [:]
	/// What a stopped submit says, shown until the person's next action.
	private var message: UILabel?
	private var touches: TouchWatcher?
	/// Each drawn checkbox (false) or radio button (true) and whether it is checked.
	private var ticks: [String: (radio: Bool, checked: Bool)] = [:]
	private(set) var overlays: OverlayHost!
	/// Each shown pre-composited opacity group's overlay, by instance id.
	private var groups: [String: GroupOverlayView] = [:]
	/// Each box moved into its stacking parent's view, by instance id: the view it was built in and the view that followed it there.
	private var restacked: [String: Restacked] = [:]

	init(
		runtime: NativeRuntime, layout: StyleLayout?, sheetLayouts: [String: [(snapPoint: Double, layout: StyleLayout)]] = [:],
		faces: [String: UIFontDescriptor], onAction: @escaping (NativeAction) -> Void,
		ask: @escaping (NativeAction) -> Bool = { _ in false },
		objectView: @escaping (_ object: String, _ device: String) throws -> UIView = { object, _ in throw HostError("no device to show \(object)") },
		images: [String: NativeImageAsset] = [:]
	) throws {
		self.images = images
		self.runtime = runtime
		self.objectView = objectView
		self.layout = layout
		self.faces = faces
		systemFaces = sheetLayouts.values.joined().reduce(layout?.systemFaces ?? [:]) { $0.merging($1.layout.systemFaces) { a, _ in a } }
		self.onAction = onAction
		self.ask = ask
		keyboard = KeyboardDismisser(page)
		assignment = layout?.start ?? 0
		shown = assignment
		let payload = runtime.payload
		let nodes = Dictionary(uniqueKeysWithValues: payload.nodes.map { ($0.id, $0) })
		self.nodes = nodes
		var slots: [String: [String]] = [:]
		for node in payload.nodes {
			let parent = node.parent ?? ""
			let key: String
			if let arm = node.arm, let branch = nodes[arm.branch], branch.row == node.row, (branch.parent ?? "") == parent {
				key = "\(arm.branch)#\(arm.index)"
			} else if let row = node.row, (nodes[row]?.parent ?? "") == parent {
				key = row
			} else {
				key = parent
			}
			slots[key, default: []].append(node.id)
		}
		self.slots = slots
		var sheetOf: [String: String] = [:]
		for node in payload.nodes {
			guard let parent = node.parent else { continue }
			if case .sheet = nodes[parent]?.kind { sheetOf[node.id] = parent } else if let sheet = sheetOf[parent] { sheetOf[node.id] = sheet }
		}
		self.sheetOf = sheetOf
		sheetStyles = sheetLayouts.mapValues { heights in (heights, 0, heights.map(\.layout.start)) }
		events = Dictionary(grouping: payload.events, by: \.host)
		page.contentInsetAdjustmentBehavior = .always
		page.accessibilityIdentifier = "markless-page"
		page.addSubview(root)
		var index = 0
		_ = try build("", in: root, at: &index, Context())
		// A tap outside a field blurs it, as on the web; a drag scrolls and keeps the keyboard up.
		for gesture in dismissGestures {
			gesture.cancelsTouchesInView = false
			gesture.delegate = keyboard
			gesture.addTarget(keyboard, action: #selector(KeyboardDismisser.dismiss))
			page.addGestureRecognizer(gesture)
		}
		if layout == nil {
			stackTree(root)
			for sheet in sheets.values { stackTree(sheet.content) }
			unstacked.removeAll()
			alignTables()
		} else {
			try sizePage()
		}
		refreshRelations()
		refreshSelects()
		overlays = OverlayHost(
			runtime: runtime, root: root, onAction: onAction,
			nodeOf: { [unowned self] view in
				view.accessibilityIdentifier.flatMap { id in self.elements[id] === view ? id : nil }
			},
			viewOf: { [unowned self] id in self.elements[id] },
			restack: { [unowned self] container in if self.layout == nil { self.stack(container) } })
		if layout != nil {
			root.layer.insertSublayer(bodyLayer, at: 0)
			paintBody()
			restackShadows()
		}
	}

	/// Whether any of `view`'s box is inside `frame` (in `screen`'s space): an IntersectionObserver with no threshold, where a
	/// hidden view or one under a hidden ancestor has no box, and an edge touching the frame counts.
	func isOnScreen(_ view: UIView, within frame: CGRect, of screen: UIView) -> Bool {
		var at: UIView? = view
		while let current = at, current !== screen {
			if current.isHidden { return false }
			at = current.superview
		}
		guard at === screen else { return false }
		let box = view.convert(view.bounds, to: screen)
		return box.minX <= frame.maxX && box.maxX >= frame.minX && box.minY <= frame.maxY && box.maxY >= frame.minY
	}

	func pageAppeared(_ host: UIViewController) {
		overlays.appeared()
		for sheet in sheets.values { sheet.hostAppeared(host) }
	}

	/// Before the page is rebuilt: its sheets go with it, without a `dismiss` action.
	func closeSheets() {
		for sheet in sheets.values { sheet.close(animated: false) }
	}

	/// Every shown element's and text's box in points from the page's top left, by node id: what a layout check compares with
	/// a browser's boxes.
	func shownFrames() -> [(id: String, frame: CGRect)] {
		(elements.map { ($0.key, $0.value as UIView) } + labels.map { ($0.key, $0.value as UIView) }).compactMap { id, view in
			var at: UIView? = view
			while let current = at, current !== root {
				if current.isHidden { return nil }
				at = current.superview
			}
			guard at === root else { return nil }
			return (templates[id] ?? id, view.convert(view.bounds, to: root))
		}.sorted { $0.id < $1.id }
	}

	/// The page laid out again at another size (a rotation, a resized window): every view takes its new box in the current assignment.
	func relayout(_ new: StyleLayout) throws {
		guard layout != nil else { return }
		layout = new
		reselect()
		try repaint { _ in true }
		paintBody()
		try sizePage()
	}

	/// The page's scrollable size: Dragon's page range over the viewport it laid out at.
	private func sizePage() throws {
		guard let layout else { return }
		let viewport = layout.viewport
		let range = layout.pageScrolls[shown]
		page.contentSize = CGSize(width: viewport.width + (range?.maxX ?? 0), height: viewport.height + (range?.maxY ?? 0))
		root.frame = CGRect(origin: .zero, size: page.contentSize)
		try restSticky()
		guard range == nil else { return }
		let drawn = root.subviews.reduce(CGRect.null) { $0.union($1.frame) }
		if drawn.maxX > viewport.width + 0.5 || drawn.maxY > viewport.height + 0.5 {
			throw HostError("the page is \(drawn.maxY) points tall on a \(viewport.height) point screen, and Dragon does not decide its scroll range: \(layout.pageScrollUndecided ?? "the style export has no page range")")
		}
	}

	/// The sticky views' places as just laid out, then moved for the page's current scroll offset.
	private func restSticky() throws {
		stickyRest = [:]
		guard let layout, let run = stickyShift else { return }
		for (id, d) in try layout.stickyShifts(assignment: assignment, x: 0, y: 0, run: run) {
			guard let view = elements[id] else { continue }
			stickyRest[id] = (view.center, d.dx, d.dy)
		}
		if stickyWatch == nil && !stickyRest.isEmpty {
			stickyWatch = page.observe(\.contentOffset) { [weak self] _, _ in MainActor.assumeIsolated { self?.stick() } }
		}
		stick()
	}

	/// Each sticky view moved by Dragon's shift at the page's scroll offset, less the shift its laid-out place already holds.
	private func stick() {
		guard let layout, let run = stickyShift, !stickyRest.isEmpty else { return }
		do {
			// The scrollport starts below the bars the page scrolls under, as the web's viewport starts at the top of the page.
			let x = Double(page.contentOffset.x + page.adjustedContentInset.left), y = Double(page.contentOffset.y + page.adjustedContentInset.top)
			for (id, d) in try layout.stickyShifts(assignment: assignment, x: x, y: y, run: run) {
				guard let rest = stickyRest[id], let view = elements[id] else { continue }
				view.center = CGPoint(x: rest.center.x + CGFloat(d.dx - rest.dx), y: rest.center.y + CGFloat(d.dy - rest.dy))
			}
		} catch {
			fatalError("Markless iOS host: \(error)")
		}
	}

	func mount(in screen: UIView) {
		page.translatesAutoresizingMaskIntoConstraints = false
		screen.addSubview(page)
		screen.keyboardLayoutGuide.usesBottomSafeArea = false
		NSLayoutConstraint.activate([
			page.topAnchor.constraint(equalTo: screen.topAnchor),
			page.leadingAnchor.constraint(equalTo: screen.leadingAnchor),
			page.trailingAnchor.constraint(equalTo: screen.trailingAnchor),
			page.bottomAnchor.constraint(equalTo: screen.keyboardLayoutGuide.topAnchor),
		])
		let watcher = TouchWatcher { [weak self] in self?.dismissMessage() }
		screen.addGestureRecognizer(watcher)
		touches = watcher
		if layout?.interaction.isEmpty == false {
			let interaction = InteractionWatcher { [weak self] phase, point in self?.interacted(phase, at: point) }
			screen.addGestureRecognizer(interaction)
			interactionWatcher = interaction
		}
		do { try overlays.mount(in: screen) } catch { hostFailed("\(error)") }
		guard layout == nil else { return }
		root.translatesAutoresizingMaskIntoConstraints = false
		let content = page.contentLayoutGuide
		NSLayoutConstraint.activate([
			root.topAnchor.constraint(equalTo: content.topAnchor),
			root.bottomAnchor.constraint(equalTo: content.bottomAnchor),
			root.leadingAnchor.constraint(equalTo: screen.layoutMarginsGuide.leadingAnchor),
			root.trailingAnchor.constraint(equalTo: screen.layoutMarginsGuide.trailingAnchor),
			content.leadingAnchor.constraint(equalTo: page.frameLayoutGuide.leadingAnchor),
			content.widthAnchor.constraint(equalTo: page.frameLayoutGuide.widthAnchor),
		])
	}

	func unmount() {
		dismissMessage()
		if let touches { touches.view?.removeGestureRecognizer(touches) }
		touches = nil
		if let interactionWatcher { interactionWatcher.view?.removeGestureRecognizer(interactionWatcher) }
		interactionWatcher = nil
		overlays.unmount()
		closeSheets()
		page.removeFromSuperview()
	}

	func dismissMessage() {
		message?.removeFromSuperview()
		message = nil
	}

	/// A stopped submit's message, pinned under the top of the page (or of the open dialog's top layer) and announced.
	private func show(_ text: String) {
		dismissMessage()
		guard let host = topLayer?.layer ?? page.superview else { return }
		let label = UILabel()
		label.text = text
		label.numberOfLines = 0
		label.textAlignment = .center
		label.textColor = .white
		label.backgroundColor = UIColor(white: 0.15, alpha: 0.92)
		label.layer.cornerRadius = 8
		label.layer.masksToBounds = true
		label.isAccessibilityElement = true
		label.translatesAutoresizingMaskIntoConstraints = false
		host.addSubview(label)
		let guide = host.safeAreaLayoutGuide
		NSLayoutConstraint.activate([
			label.topAnchor.constraint(equalTo: guide.topAnchor, constant: 8),
			label.centerXAnchor.constraint(equalTo: guide.centerXAnchor),
			label.widthAnchor.constraint(lessThanOrEqualTo: guide.widthAnchor, constant: -32),
			label.heightAnchor.constraint(greaterThanOrEqualToConstant: 44),
		])
		message = label
		UIAccessibility.post(notification: .announcement, argument: text)
	}

	/// The colour behind the page in the current assignment: the export's canvas, else the web canvas's white.
	var canvas: UIColor? { layout.map { $0.canvases[shown].map(uiColor) ?? .white } }

	/// body's own background, under every view of the page, where the current assignment gives it one.
	private func paintBody() {
		CATransaction.begin()
		CATransaction.setDisableActions(true)
		defer { CATransaction.commit() }
		guard let body = layout?.bodies[shown] else {
			bodyLayer.isHidden = true
			return
		}
		bodyLayer.zPosition = -1
		bodyLayer.frame = CGRect(x: body.frame.x, y: body.frame.y, width: body.frame.width, height: body.frame.height)
		bodyLayer.backgroundColor = uiColor(body.color).cgColor
		bodyLayer.isHidden = false
	}

	/// Scrolls every scrolling ancestor of `target`, innermost first, as Chrome's scrollIntoView() (`scrollIntoViewAlign`) or
	/// focus() (`focusIntoViewAlign`) does.
	func bringIntoView(_ target: UIView, block: ScrollAlign, inline: ScrollAlign) {
		page.layoutIfNeeded()
		var chain: [UIScrollView] = []
		var ancestor = target.superview
		while let view = ancestor {
			if let scroll = view as? UIScrollView { chain.append(scroll) }
			ancestor = view.superview
		}
		guard let inner = chain.first else { return }
		let boxes = chain.enumerated().map { index, scroll -> ScrollBox in
			let inset = scroll.adjustedContentInset
			let width = scroll.bounds.width - inset.left - inset.right
			let height = scroll.bounds.height - inset.top - inset.bottom
			let origin = index + 1 < chain.count ? scroll.superview!.convert(scroll.frame.origin, to: chain[index + 1]) : scroll.frame.origin
			return ScrollBox(
				port: ScrollRect(x: origin.x + inset.left, y: origin.y + inset.top, width: width, height: height),
				offset: (scroll.contentOffset.x + inset.left, scroll.contentOffset.y + inset.top),
				range: ScrollOffsetRange(minX: 0, maxX: max(0, scroll.contentSize.width - width), minY: 0, maxY: max(0, scroll.contentSize.height - height)))
		}
		let shown = target.convert(target.bounds, to: inner)
		let offsets = scrollIntoView(
			boxes, target: ScrollRect(x: shown.minX, y: shown.minY, width: shown.width, height: shown.height), block: block, inline: inline)
		for (scroll, offset) in zip(chain, offsets) {
			let inset = scroll.adjustedContentInset
			scroll.setContentOffset(CGPoint(x: offset.x - inset.left, y: offset.y - inset.top), animated: false)
		}
	}

	/// The focused text field in this page, if any.
	var focusedField: UIView? { elements.values.first { ($0 is UITextField || $0 is TextArea) && $0.isFirstResponder } }

	/// The journal applier: the only code that changes a retained view after the first build.
	func apply(_ journal: [NativeJournalEntry]) throws {
		var liveChanges: [(region: String, text: String)] = []
		for entry in journal {
			switch entry {
			case let .text(node, value):
				if let region = liveRegion(around: node) { liveChanges.append((region, value)) }
				if let paragraph = paragraphs[node] {
					paragraphTexts[node] = value
					try render(paragraph)
					if let button = contexts[node]?.button { refreshLabel(of: button) }
					continue
				}
				guard let label = labels[node] else { throw HostError("journal names text node \(node), which is not shown") }
				label.text = value
				drawLines(label)
				if let button = contexts[node]?.button { refreshLabel(of: button) }
			case .selected:
				// Each select's shown choice is read again once the whole journal is applied.
				continue
			case let .checked(node, checked):
				if elements[node] is AbsentField { continue }
				guard let tick = ticks[node], let view = elements[node] else { throw HostError("journal names checkbox \(node), which is not shown") }
				ticks[node] = (tick.radio, checked)
				drawTick(node, view)
			case let .property(node, name, value):
				if elements[node] is AbsentField { continue }
				if name == "files", let picker = elements[node] as? FileInputView {
					picker.show(names: value)
					continue
				}
				if let area = elements[node] as? TextArea {
					area.text = value
					continue
				}
				guard let field = elements[node] as? UITextField else { throw HostError("journal names input \(node), which is not a shown field") }
				field.text = value
			case let .attribute(node, name, value):
				if let drawn = shapeOwners[node] {
					attributes[node, default: [:]][name] = value
					if name == "d" { drawn.setOutline(node, value) }
					continue
				}
				if followingViewBox.contains(node), name == "viewBox", let drawn = elements[node] as? DrawingView {
					attributes[node, default: [:]][name] = value
					drawn.setViewBox(value)
					continue
				}
				if flowing.contains(node) {
					attributes[node, default: [:]][name] = value
					if let button = contexts[node]?.button { refreshLabel(of: button) }
					continue
				}
				guard let view = elements[node] else { throw HostError("journal names element \(node), which is not shown") }
				attributes[node, default: [:]][name] = value
				applyAttributes(node, view)
			case let .sheet(node, open):
				guard let sheet = sheets[node] else { throw HostError("journal names sheet \(node), which is not built") }
				if open { sheet.open(from: presenter) } else { sheet.close() }
			case .navigate, .title, .slot:
				throw HostError("navigate, title and slot entries reach the screen's controller, not its views")
			case .call, .release, .fetch, .abort:
				throw HostError("a \(entry.json.jsonText) entry reaches the page's device or script services, not its views")
			case let .dialog(node, open):
				try present(node, open: open)
			case let .command(node, command, preventScroll):
				guard let view = elements[node] else { throw HostError("journal names element \(node), which is not shown") }
				root.layoutIfNeeded()
				// As on the web: scrollIntoView aligns the element to the start; focus brings it into view unless told not to.
				if command == "showPicker" {
					(view as? FileInputView)?.open()
					break
				}
				if command == "scrollIntoView" {
					bringIntoView(view, block: scrollIntoViewAlign.block, inline: scrollIntoViewAlign.inline)
					break
				}
				// `select()` selects a field's whole text; it does not move focus, as on the web.
				if command == "select" {
					if let field = view as? UITextField { field.selectedTextRange = field.textRange(from: field.beginningOfDocument, to: field.endOfDocument) }
					else if let area = view as? TextArea { area.selectedTextRange = area.textRange(from: area.beginningOfDocument, to: area.endOfDocument) }
					break
				}
				if !preventScroll { bringIntoView(view, block: focusIntoViewAlign.block, inline: focusIntoViewAlign.inline) }
				if view is UITextField || view is TextArea {
					view.becomeFirstResponder()
				} else {
					try overlays.focus(node)
				}
			case let .invalid(node, text):
				guard let view = elements[node] else { throw HostError("journal names field \(node), which is not shown") }
				if view is UITextField || view is TextArea {
					root.layoutIfNeeded()
					bringIntoView(view, block: focusIntoViewAlign.block, inline: focusIntoViewAlign.inline)
					view.becomeFirstResponder()
				}
				show(text)
			case .preventDefault:
				// Read by the field that dispatched the key or paste, which leaves out what it would do.
				continue
			case let .timer(timer, ms):
				timers.removeValue(forKey: timer)?.cancel()
				timers[timer] = Task { @MainActor [weak self] in
					try? await Task.sleep(for: .milliseconds(ms))
					// A page left since (or never mounted) has no runtime holding this timer any more.
					guard !Task.isCancelled, let self, self.root.superview != nil else { return }
					self.timers[timer] = nil
					self.onAction(NativeAction(event: .timer, timer: timer))
				}
			case let .clearTimer(timer):
				timers.removeValue(forKey: timer)?.cancel()
			case let .overlay(node, open, modal):
				if open { try overlays.open(node, modal: modal) } else { overlays.close(node) }
			case let .state(cell, value):
				if let layout, cell != StyleBands.state || layout.stateCells.contains(cell) {
					assignment = try layout.next(from: assignment, cell: cell, value: value)
					reselect()
				}
				for (sheet, styles) in sheetStyles {
					var moved = styles
					for (index, height) in styles.heights.enumerated() where height.layout.stateCells.contains(cell) {
						moved.assignments[index] = try height.layout.next(from: styles.assignments[index], cell: cell, value: value)
					}
					sheetStyles[sheet] = moved
				}
				try repaint { _ in true }
				paintBody()
				try sizePage()
			case let .arm(node, index):
				guard let branch = branches[node], let context = contexts[node] else { throw HostError("journal names branch \(node), which is not shown") }
				let container = branch.anchor.superview ?? root
				for id in branch.built { remove(id) }
				var position = (container.subviews.firstIndex(of: branch.anchor) ?? container.subviews.count) + 1
				let built = try index.map { try build("\(templates[node] ?? node)#\($0)", in: container, at: &position, context) } ?? []
				branches[node] = (branch.anchor, index, built)
				settle(container, built: built, context)
				try followArms()
			case let .rows(node, keys):
				guard let list = lists[node], var context = contexts[node] else { throw HostError("journal names list \(node), which is not shown") }
				// An inner list's copy reads its outer row's item as it is now, not as it was when the row was built.
				let template = templates[node] ?? node
				if let now = try nodes[template].flatMap({ try runtime.instances(of: $0).first { $0.id == node } }) { context.scope = now.scope }
				let container = list.anchor.superview ?? root
				var built = list.built
				for key in list.keys where !keys.contains(key) {
					for id in built.removeValue(forKey: key) ?? [] { remove(id) }
				}
				let items = Dictionary(try runtime.rows(of: template, in: context.scope).map { ($0.key, $0.item) }, uniquingKeysWith: { $1 })
				var position = container.subviews.count
				for (place, key) in keys.enumerated() where built[key] == nil {
					guard let item = items[key] else { throw HostError("\(node) has no current row \(key)") }
					built[key] = try buildRow(template, key: key, item: item, position: place, in: container, at: &position, context)
				}
				position = (container.subviews.firstIndex(of: list.anchor) ?? 0) + 1
				var placed = Set<ObjectIdentifier>()
				for key in keys {
					for id in (built[key] ?? []).flatMap(withArms) {
						guard let view = branches[id]?.anchor ?? paragraphs[id]?.view ?? elements[id] ?? labels[id], placed.insert(ObjectIdentifier(view)).inserted else { continue }
						container.insertSubview(view, at: position)
						position += 1
					}
				}
				lists[node] = (list.anchor, keys, built)
				settle(container, built: keys.flatMap { built[$0] ?? [] }, context)
			}
		}
		refreshRelations()
		refreshSelects()
		if layout == nil { alignTables() }
		restackShadows()
		markGroupsDirty()
		overlays.flush()
		announce(liveChanges)
	}

	/// How a live region's change is spoken; replaced in tests.
	var announce: (_ text: String, _ assertive: Bool) -> Void = { text, assertive in
		UIAccessibility.post(
			notification: .announcement,
			argument: assertive ? text as Any : NSAttributedString(string: text, attributes: [.accessibilitySpeechQueueAnnouncement: true]))
	}

	/// The live region holding a text node (a row's copy keeps its `@key`), if any.
	private func liveRegion(around text: String) -> String? {
		let at = text.firstIndex(of: "@")
		let base = at.map { String(text[..<$0]) } ?? text
		let suffix = at.map { String(text[$0...]) } ?? ""
		var parent = nodes[base]?.parent
		while let id = parent, let node = nodes[id] {
			if node.live != nil || node.liveFollows != nil { return id + suffix }
			parent = node.parent
		}
		return nil
	}

	/// How a live region (a row's copy keeps its `@key`) speaks now: as built, or, when its attributes follow state, as they
	/// read at this moment in its own row.
	private func liveNow(_ region: String) -> NativeLive? {
		let base = region.split(separator: "@").first.map(String.init) ?? region
		guard let node = nodes[base], let follows = node.liveFollows else { return nodes[base]?.live }
		let scope = (try? runtime.instances(of: node).first { $0.id == region }?.scope) ?? .empty
		guard case let .string(politeness) = try? runtime.evaluate(follows.politeness, in: scope) else { return nil }
		return NativeLive(assertive: politeness == "assertive", atomic: (try? runtime.evaluate(follows.atomic, in: scope)) == .bool(true))
	}

	/// Each live region a journal changed, spoken once: whole when atomic, else the text that changed.
	private func announce(_ changes: [(region: String, text: String)]) {
		var order: [String] = []
		var changed: [String: [String]] = [:]
		for (region, text) in changes {
			if changed[region] == nil { order.append(region) }
			changed[region, default: []].append(text)
		}
		for region in order {
			guard let live = liveNow(region), let view = elements[region] ?? paragraphs[region]?.view else { continue }
			let spoken = live.atomic ? text(within: view) : changed[region, default: []].joined(separator: " ")
			if !spoken.isEmpty { announce(spoken, live.assertive) }
		}
	}

	/// The top layer: a full-screen view above the page and the bars holding the dialog's own view (styled by its CSS, not a
	/// system sheet). VoiceOver treats the page behind as inert, and its escape gesture closes the dialog as a cancel.
	private func present(_ node: String, open: Bool) throws {
		guard let view = elements[node] else { throw HostError("journal names dialog \(node), which is not shown") }
		if open {
			guard topLayer == nil else { throw HostError("a second dialog over \(node) has no top layer yet") }
			guard let screen = root.superview, let home = view.superview, let index = home.subviews.firstIndex(of: view) else {
				throw HostError("dialog \(node) opened before the page was mounted")
			}
			view.removeFromSuperview()
			let layer = TopLayerView()
			let onAction = onAction
			layer.onEscape = { onAction(NativeAction(event: .cancel, host: node)) }
			// Chrome's ::backdrop default, rgba(0, 0, 0, 0.1).
			layer.backgroundColor = UIColor(white: 0, alpha: 0.1)
			layer.accessibilityViewIsModal = true
			layer.translatesAutoresizingMaskIntoConstraints = false
			screen.addSubview(layer)
			view.isHidden = false
			view.backgroundColor = .white
			view.translatesAutoresizingMaskIntoConstraints = false
			layer.addSubview(view)
			let guide = layer.safeAreaLayoutGuide
			NSLayoutConstraint.activate([
				layer.topAnchor.constraint(equalTo: screen.topAnchor),
				layer.bottomAnchor.constraint(equalTo: screen.bottomAnchor),
				layer.leadingAnchor.constraint(equalTo: screen.leadingAnchor),
				layer.trailingAnchor.constraint(equalTo: screen.trailingAnchor),
				// Centred, as the web centres a modal dialog (dialog:modal { inset: 0; margin: auto }) on every platform.
				view.centerXAnchor.constraint(equalTo: guide.centerXAnchor),
				view.centerYAnchor.constraint(equalTo: guide.centerYAnchor),
				view.widthAnchor.constraint(lessThanOrEqualTo: guide.widthAnchor, constant: -32),
			])
			root.accessibilityElementsHidden = true
			topLayer = (layer, home, index)
			UIAccessibility.post(notification: .screenChanged, argument: view)
		} else {
			guard let top = topLayer else { return }
			view.removeFromSuperview()
			top.layer.removeFromSuperview()
			view.isHidden = true
			view.backgroundColor = .clear
			top.home.insertSubview(view, at: min(top.index, top.home.subviews.count))
			root.accessibilityElementsHidden = false
			if layout == nil { stack(top.home) }
			topLayer = nil
			UIAccessibility.post(notification: .screenChanged, argument: nil)
		}
	}

	/// The text an element shows, in view order: what `aria-labelledby` and `aria-describedby` read from it.
	private func text(within view: UIView, skipping skipped: UIView? = nil) -> String {
		// A list item's marker is a decoration (CSS's ::marker), not text of the element.
		if view === skipped || decorations.contains(ObjectIdentifier(view)) { return "" }
		if let label = view as? UILabel { return label.text ?? "" }
		return view.subviews.map { text(within: $0, skipping: skipped) }.filter { !$0.isEmpty }.joined(separator: " ")
	}

	/// Labels and hints taken from the elements an attribute names by id, kept current after every journal; a `<label>` names
	/// its control with its text, so VoiceOver reads it there and not a second time on the label.
	private func refreshRelations() {
		for (id, view) in elements {
			let current = attributes[id] ?? [:]
			let named = { (attribute: String) -> String? in
				current[attribute].map { ids in
					ids.split(separator: " ").compactMap { self.elements[String($0)] }.map { self.text(within: $0) }.joined(separator: " ")
				}
			}
			if current["aria-label"] == nil, let label = named("aria-labelledby") { view.accessibilityLabel = label }
			if let hint = named("aria-describedby") { view.accessibilityHint = hint }
			guard let target = current["for"], let control = elements[target] else { continue }
			let own = attributes[target] ?? [:]
			// A control hidden from assistive technology takes no name, and its label reads as the text it is.
			if own["aria-hidden"] == "true" { continue }
			let unnamed = own["aria-label"] == nil && own["aria-labelledby"] == nil
			if unnamed { control.accessibilityLabel = text(within: view, skipping: control) }
			if !control.isDescendant(of: view) { view.accessibilityElementsHidden = true }
			else if unnamed { for sub in view.subviews where sub !== control && !control.isDescendant(of: sub) { sub.accessibilityElementsHidden = true } }
		}
	}

	/// Paints a view and puts it at its frame; inside a scroll container, frames count from the scroll view's padding box.
	private func place(_ id: String, _ view: UIView, _ style: ResolvedStyle) throws {
		let frameSpace = try restack(id, view, style)
		// UIKit leaves frame undefined under a transform: the box is placed untransformed, then transformed at its new size.
		if !CATransform3DIsIdentity(view.layer.transform) { view.layer.setAffineTransform(.identity) }
		try paint(view, style, faces: faces)
		if let frameSpace, let superview = view.superview { view.frame = frameSpace.convert(view.frame, to: superview) }
		if let label = view as? UILabel { drawLines(label, style) }
		if let clip = clipViews[id] { clip.shape(style.childClip, in: view.bounds) }
		else if style.childClip != nil, !(view is TextField), !(view is TextArea) { throw HostError("\(id) began clipping overflow past its borders after it was built") }
		if frameSpace == nil, let host = view.superview as? ContainerScrollView { view.frame.origin = CGPoint(x: view.frame.minX - host.inset.left, y: view.frame.minY - host.inset.top) }
		try paintShadow(id, view, style)
		try paintOutline(id, style)
		let shown = style.frame != nil && !(view is AbsentField)
		try applyTransform(id, view, shown ? style.transform : nil)
		try paintGroup(id, view, shown ? style.group : nil)
		if let opacity = shown ? style.opacity : nil {
			guard let alpha8 = DragonPaint.opacityAlpha8 else { throw HostError("\(id): opacity needs Dragon's alpha byte, which this host does not link") }
			view.alpha = CGFloat(try alpha8(opacity) / 255)
		} else {
			view.alpha = 1
		}
		markGroupsDirty()
		guard let scroll = scrollViews[id] else {
			if style.scroll != nil { throw HostError("\(id) became a scroll container after it was built") }
			return
		}
		guard let s = style.scroll else { throw HostError("\(id) stopped being a scroll container after it was built") }
		scroll.configure(s, in: view.bounds.size, cornerRadius: style.cornerRadius)
	}

	/// Shows a pre-composited opacity group's composite over its view, or takes it away.
	private func paintGroup(_ id: String, _ view: UIView, _ group: OpacityGroup?) throws {
		let shown = view.subviews.lazy.compactMap { $0 as? GroupOverlayView }.first
		guard let group else {
			shown?.removeFromSuperview()
			groups[id] = nil
			return
		}
		guard let alpha8 = DragonPaint.opacityAlpha8, DragonPaint.groupComposite != nil, DragonPaint.groupCompositeLayered != nil else {
			throw HostError("\(id): an opacity group needs Dragon's composite, which this host does not link")
		}
		let a8 = try alpha8(group.opacity)
		if let shown, shown.group == group, shown.alpha8 == a8 {
			shown.takeBorder(from: view)
			return
		}
		shown?.removeFromSuperview()
		let overlay = GroupOverlayView(id: id, group: group, alpha8: a8, context: groupContext)
		overlay.takeBorder(from: view)
		view.addSubview(overlay)
		groups[id] = overlay
	}

	/// A box or text changed its layout or paint: every group's composite is stale and recomputes in the next layout pass.
	private func markGroupsDirty() {
		for (id, overlay) in groups {
			if overlay.superview == nil { groups[id] = nil } else { overlay.markDirty() }
		}
	}

	private lazy var groupContext = GroupContext(
		pageRoot: root,
		canvas: { [unowned self] in self.canvas ?? .white },
		scale: { [unowned self] in self.layout?.dpr ?? Double(self.root.traitCollection.displayScale) },
		rootOverflows: { [unowned self] in
			guard let layout = self.layout, let range = layout.pageScrolls[self.assignment] else { return false }
			return range.maxX > 0 || range.maxY > 0
		},
		overlay: { [unowned self] painter, from in
			// A painter in the same list row as the group is that row's copy.
			let suffix = from.firstIndex(of: "@").map { String(from[$0...]) } ?? ""
			return (self.groups[painter + suffix] ?? self.groups[painter]).flatMap { $0.superview == nil ? nil : $0 }
		},
		view: { [unowned self] id, from in
			let suffix = from.firstIndex(of: "@").map { String(from[$0...]) } ?? ""
			return self.elements[id + suffix] ?? self.elements[id]
		},
		overlays: { [unowned self] in Array(self.groups.values) })

	private func paintOutline(_ id: String, _ style: ResolvedStyle) throws {
		guard let outline = style.outline else {
			outlines.removeValue(forKey: id)?.removeFromSuperview()
			return
		}
		guard let host = elements[outline.host] else { throw HostError("\(id): its outline is drawn in \(outline.host), which has no view") }
		let view = outlines[id] ?? OutlineView()
		outlines[id] = view
		try view.apply(outline, in: host)
	}

	/// Views inserted beside a box since its shadow was placed go beneath that shadow again.
	private func restackShadows() {
		for (id, layers) in shadows { if let view = elements[id] { layers.restack(beneath: view) } }
	}

	private func paintShadow(_ id: String, _ view: UIView, _ style: ResolvedStyle) throws {
		guard let shadow = style.shadow else {
			shadows.removeValue(forKey: id)?.remove()
			return
		}
		if style.clipRect != nil { throw HostError("\(id): box-shadow on a box with a clip-path is not implemented on iOS") }
		let layers = shadows[id] ?? ShadowLayers()
		shadows[id] = layers
		try layers.apply(shadow, to: view)
	}

	/// Moves a box whose stacking context paints it past ancestors with later siblings into the view of its `stackingParent`, where
	/// its zPosition orders it among that context's boxes, and back to the view it was built in when it no longer is.
	/// Returns the view the style's frame is given in when the move waits for the finger to lift: UIKit cancels a touch whose
	/// view leaves its window, so a box restacked by a pressed state stays where it is until the touch is over.
	private func restack(_ id: String, _ view: UIView, _ style: ResolvedStyle) throws -> UIView? {
		guard style.frame != nil else { return nil }
		if let parent = style.stackingParent {
			guard let target = scrollViews[parent] ?? clipViews[parent] ?? elements[parent] else { throw HostError("\(id) paints in the order of \(parent), which has no view") }
			if view.superview === target { return nil }
			if fingerDown {
				restackAfterTouch = true
				return target
			}
			if restacked[id] == nil, let home = view.superview, let at = home.subviews.firstIndex(of: view) {
				restacked[id] = Restacked(home: home, next: at + 1 < home.subviews.count ? home.subviews[at + 1] : nil)
			}
			view.removeFromSuperview()
			// After the boxes moved there that paint below it, so hit testing, which walks subviews from the last, meets the topmost first.
			let z = style.paintOrder.map { CGFloat($0.bucket) * 100_000 + CGFloat($0.rank) + 1 } ?? 0
			let moved = Set(restacked.keys.compactMap { elements[$0].map(ObjectIdentifier.init) })
			if let above = target.subviews.firstIndex(where: { moved.contains(ObjectIdentifier($0)) && $0.layer.zPosition > z }) {
				target.insertSubview(view, at: above)
			} else {
				target.addSubview(view)
			}
		} else if let place = restacked[id] {
			guard let home = place.home else {
				restacked[id] = nil
				return nil
			}
			if fingerDown {
				restackAfterTouch = true
				return home
			}
			restacked[id] = nil
			view.removeFromSuperview()
			if let next = place.next, next.superview === home { home.insertSubview(view, belowSubview: next) } else { home.addSubview(view) }
		}
		return nil
	}

	/// Draws Dragon's lines over a label while its text is the one Dragon laid out; otherwise the label draws its own.
	private func drawLines(_ label: UILabel, _ given: ResolvedStyle? = nil) {
		let drawn = label.layer.sublayers?.first { $0 is GlyphLinesLayer } as? GlyphLinesLayer
		guard let id = label.accessibilityIdentifier, let style = given ?? self.style(of: id), let lines = style.lines,
			style.linesText == label.text, lines.allSatisfy({ $0.runs.allSatisfy { systemFaces[$0.face] != nil || faces[$0.face] != nil } })
		else {
			if let drawn {
				drawn.removeFromSuperlayer()
				label.textColor = drawn.textColor
			}
			return
		}
		let layer = drawn ?? GlyphLinesLayer()
		if drawn == nil {
			layer.textColor = label.textColor
			label.layer.addSublayer(layer)
		}
		if let color = style.textColor { layer.textColor = uiColor(color) }
		// One device px of slack on every side, so a glyph whose ink passes its advance is not cut at the frame's edge.
		let scale = label.traitCollection.displayScale > 0 ? label.traitCollection.displayScale : UIScreen.main.scale
		layer.slack = 1 / scale
		layer.frame = label.bounds.insetBy(dx: -layer.slack, dy: -layer.slack)
		layer.contentsScale = scale
		layer.lines = lines
		layer.faces = systemFaces
		layer.webFaces = faces
		layer.setNeedsDisplay()
		label.textColor = .clear
	}

	/// Moves each styled branch's style state to the arm it shows now, inner ones included, and lays the page out again.
	private func followArms() throws {
		var moved = false
		if let layout {
			for cell in layout.stateCells {
				guard let value = try runtime.styleArm(of: cell) else { continue }
				let reached = try layout.next(from: assignment, cell: cell, value: value)
				moved = moved || reached != assignment
				assignment = reached
			}
		}
		for (sheet, styles) in sheetStyles {
			var next = styles
			for (index, height) in styles.heights.enumerated() {
				for cell in height.layout.stateCells {
					guard let value = try runtime.styleArm(of: cell) else { continue }
					next.assignments[index] = try height.layout.next(from: next.assignments[index], cell: cell, value: value)
				}
			}
			moved = moved || next.assignments != styles.assignments
			sheetStyles[sheet] = next
		}
		guard moved else { return }
		reselect()
		try repaint { _ in true }
		try sizePage()
	}

	/// A touch on the page as Dragon's interaction runtime takes it: the element under the finger, then the state it selects.
	private func interacted(_ phase: InteractionWatcher.Phase, at point: CGPoint) {
		let node = phase == .cancelled ? nil : touchedNode(at: point)
		switch phase {
		case .began:
			fingerDown = true
			pressedRow = node?.row
			interactionSteps.append(("touch-down", node?.id))
		case .ended:
			pressedRow = nil
			focusedRow = node?.row
			interactionSteps.append(("touch-up", node?.id))
		case .cancelled:
			pressedRow = nil
			interactionSteps.append(("touch-cancel", nil))
		}
		// The views take the lift in this pass; the boxes a pressed state left in place move once it is over.
		if phase != .began { DispatchQueue.main.async { [weak self] in self?.touchOver() } }
		let before = shown
		reselect()
		guard shown != before else { return }
		repaintShown()
	}

	private func touchOver() {
		fingerDown = false
		guard restackAfterTouch else { return }
		restackAfterTouch = false
		repaintShown()
	}

	private func repaintShown() {
		do {
			try repaint { _ in true }
			paintBody()
			try sizePage()
		} catch {
			fatalError("Markless iOS host: \(error)")
		}
		onShown?()
	}

	/// The payload node under `point` and, inside a list row, the row copy it is in.
	private func touchedNode(at point: CGPoint) -> (id: String, row: String?)? {
		guard let screen = page.superview, var view = screen.hitTest(point, with: nil) else { return nil }
		let ids = Dictionary(elements.map { (ObjectIdentifier($0.value), $0.key) }, uniquingKeysWith: { a, _ in a })
		while true {
			if let id = ids[ObjectIdentifier(view)] {
				let template = templates[id] ?? id
				return (template, id.firstIndex(of: "@").map { String(id[id.index(after: $0)...]) })
			}
			guard let parent = view.superview else { return nil }
			view = parent
		}
	}

	/// The entry to show: the state `rt-interaction` selects over the steps in the assignment's level, or the assignment.
	private func reselect() {
		defer { onEntries?() }
		shown = assignment
		guard let layout, let library, layout.interaction.indices.contains(assignment) else { return }
		let level = layout.interaction[assignment]
		guard !level.entries.isEmpty else { return }
		// A step names the nearest ancestor the level's tables address; one under none of them touches no element (-1).
		let index = { (node: String?) -> Int in
			var id = node
			while let at = id {
				if let found = level.addresses.firstIndex(of: at) { return found }
				id = self.nodes[at]?.parent
			}
			return -1
		}
		let steps = interactionSteps.map { step -> String in
			step.op == "touch-cancel" ? "[\"touch-cancel\"]" : "[\"\(step.op)\",\(index(step.node))]"
		}
		let line = "[\"rt-interaction\",\(level.tables),\(level.entries.count),[\(steps.joined(separator: ","))]]"
		guard let records = try? JSONValue.parse(Data(library(line).utf8)), case let .array(out) = records, out.count == 2,
			case .string("ok") = out[0], case let .array(trace) = out[1], case let .array(last)? = trace.last, last.count == 6,
			case let .string(bits) = last[5], let pattern = UInt64(bits, radix: 16)
		else { return }
		let state = Double(bitPattern: pattern)
		if state >= 0, Int(state) < level.entries.count { shown = level.entries[Int(state)] }
	}

	private func style(of id: String) -> ResolvedStyle? {
		guard let template = templates[id] else { return nil }
		if let sheet = sheetOf[template] {
			guard let styles = sheetStyles[sheet] else { return nil }
			return styles.heights[styles.height].layout.assignments[styles.assignments[styles.height]][template]
		}
		// An interaction state styles the row copy the touch was in; every other copy of that row keeps the assignment's look.
		let row = id.firstIndex(of: "@").map { String(id[id.index(after: $0)...]) }
		let entry = shown != assignment && id != template && row != pressedRow && row != focusedRow ? assignment : shown
		// A row's copy has its own box once the page's rows are laid out; until then its template's.
		return layout?.assignments[entry][id] ?? layout?.assignments[entry][template]
	}

	private func repaint(where included: (String) -> Bool) throws {
		for (id, view) in elements.map({ ($0.key, $0.value as UIView) }) + labels.map({ ($0.key, $0.value as UIView) }) where included(id) {
			if let style = style(of: id) { try place(id, view, style) }
		}
	}

	/// The sheet came to rest at another height: its content takes that height's layout.
	private func sheetRested(_ sheet: String, at snapPoint: Double) throws {
		guard var styles = sheetStyles[sheet], let height = styles.heights.firstIndex(where: { $0.snapPoint == snapPoint }) else { return }
		guard height != styles.height else { return }
		styles.height = height
		sheetStyles[sheet] = styles
		try repaint { id in templates[id].flatMap { sheetOf[$0] } == sheet }
	}

	/// A styled sheet's content area at a resting height, and the size its document takes there.
	private func sheetArea(_ sheet: String, at snapPoint: Double) -> (viewport: CGSize, content: CGSize)? {
		guard let styles = sheetStyles[sheet], let index = styles.heights.firstIndex(where: { $0.snapPoint == snapPoint }) else { return nil }
		let layout = styles.heights[index].layout
		let extent = layout.extents[styles.assignments[index]]
		return (
			CGSize(width: layout.viewport.width, height: layout.viewport.height),
			CGSize(width: layout.viewport.width, height: max(layout.viewport.height, extent)))
	}

	private func settle(_ container: UIView, built: [String], _ context: Context) {
		if let button = context.button { refreshLabel(of: button) }
		if layout == nil {
			stack(container)
			for id in built.flatMap(withArms) { if let view = elements[id] { stackTree(view) } }
			for id in unstacked { if let sheet = sheets[id] { stackTree(sheet.content) } }
			unstacked.removeAll()
		}
	}

	/// A branch instance followed by what its shown arm placed, recursively; any other id alone.
	private func withArms(_ id: String) -> [String] {
		[id] + (branches[id]?.built.flatMap(withArms) ?? [])
	}

	private func buildRow(_ list: String, key: String, item: NativeValue, position: Int, in container: UIView, at index: inout Int, _ context: Context) throws -> [String] {
		// A row of a list inside another list's row is keyed by both (`<id>@<outer>@<key>`), as the runtime names it.
		var row = context
		row.suffix = "\(context.suffix)@\(key)"
		row.scope.items[list] = item
		row.scope.keys[list] = String(row.suffix.dropFirst())
		row.scope.positions[list] = position
		return try build(list, in: container, at: &index, row)
	}

	private func anchor(in container: UIView, at index: inout Int) -> UIView {
		let anchor = UIView()
		anchor.isHidden = true
		anchor.isAccessibilityElement = false
		anchors.insert(ObjectIdentifier(anchor))
		container.insertSubview(anchor, at: index)
		index += 1
		return anchor
	}

	/// The view factory: builds one slot list's instances from current values, inserting them into `container` at `index`.
	private func build(_ key: String, in container: UIView, at index: inout Int, _ context: Context) throws -> [String] {
		var built: [String] = []
		let slot = slots[key] ?? []
		var position = 0
		while position < slot.count {
			let template = slot[position]
			let node = nodes[template]!
			if layout == nil, node.isText || node.defaultStyle?.flow != nil {
				// A run of text and phrase elements is one paragraph (`nativeParagraphs`).
				var run: [String] = []
				while position < slot.count, let next = nodes[slot[position]], next.isText || next.defaultStyle?.flow != nil {
					run.append(slot[position])
					position += 1
				}
				built += try buildParagraph(run, in: container, at: &index, context)
				continue
			}
			position += 1
			let id = template + context.suffix
			built.append(id)
			templates[id] = template
			contexts[id] = context
			switch node.kind {
			case let .element(element, staticAttributes, bindings):
				if let shape = node.shape {
					guard let drawn = container as? DrawingView else { throw HostError("the shape \(id) is not inside a drawing") }
					var current = staticAttributes
					for binding in bindings where !binding.isProperty {
						current[binding.name] = marklessAttributeValue(binding.name, try runtime.evaluate(binding.value, in: context.scope))
					}
					attributes[id] = current
					shapeOwners[id] = drawn
					drawn.addShape(id, shape, outline: current["d"])
					continue
				}
				if unimplementedElements.contains(element) { throw HostError("<\(element)> \(id) has no iOS view yet") }
				let view: UIView
				if let drawing = node.drawing {
					let drawn = DrawingView(drawing)
					let boundBox = try bindings.first { !$0.isProperty && $0.name == "viewBox" }.map {
						marklessAttributeValue("viewBox", try runtime.evaluate($0.value, in: context.scope))
					}
					if let boundBox {
						followingViewBox.insert(id)
						drawn.setViewBox(boundBox)
					}
					drawn.isUserInteractionEnabled = context.button == nil
					if layout == nil {
						leaves.insert(ObjectIdentifier(drawn))
						let ratio = drawn.viewBox.map { $0[3] / $0[2] }
						let unit = drawing.em ? Double(TextLook.baseSize * context.look.scale) : 1
						switch (drawing.width.map { $0 * unit }, drawing.height.map { $0 * unit }) {
						case let (width?, height?):
							drawn.widthAnchor.constraint(equalToConstant: width).isActive = true
							drawn.heightAnchor.constraint(equalToConstant: height).isActive = true
						case let (width?, nil):
							drawn.widthAnchor.constraint(equalToConstant: width).isActive = true
							drawn.heightAnchor.constraint(equalToConstant: width * (ratio ?? 0.5)).isActive = true
						case let (nil, height?):
							drawn.heightAnchor.constraint(equalToConstant: height).isActive = true
							drawn.widthAnchor.constraint(equalToConstant: height / (ratio ?? 0.5)).isActive = true
						case (nil, nil):
							if let ratio {
								// The web's inline svg without a size: the container's width, the viewBox's ratio.
								fullWidth.insert(ObjectIdentifier(drawn))
								drawn.heightAnchor.constraint(equalTo: drawn.widthAnchor, multiplier: ratio).isActive = true
							} else {
								drawn.widthAnchor.constraint(equalToConstant: 300).isActive = true
								drawn.heightAnchor.constraint(equalToConstant: 150).isActive = true
							}
						}
					}
					view = drawn
				} else if element == "button" || element == "a" || element == "summary" {
					if context.button != nil { throw HostError("<\(element)> \(id) is inside another control") }
					let control = UIButton(type: .custom)
					control.isAccessibilityElement = true
					control.accessibilityTraits = element == "a" ? .link : .button
					view = control
				} else if element == "camera" {
					guard let object = nodes[template]?.object, let device = runtime.payload.objects.first(where: { $0.id == object })?.device else {
						throw HostError("<camera> \(id) shows no device object")
					}
					view = try objectView(object, device)
					if layout == nil {
						view.widthAnchor.constraint(equalToConstant: 240).isActive = true
						view.heightAnchor.constraint(equalToConstant: 180).isActive = true
					}
				} else if element == "audio" {
					if context.button != nil { throw HostError("<audio> \(id) is inside a button") }
					if !(slots[template] ?? []).isEmpty { throw HostError("<audio> \(id)'s children have no iOS view yet") }
					let audio = AudioButton()
					if layout == nil {
						audio.widthAnchor.constraint(equalToConstant: 120).isActive = true
						audio.heightAnchor.constraint(equalToConstant: 44).isActive = true
					}
					view = audio
				} else if element == "iframe" {
					// The browser's embedded page: the platform's web view at the iframe's size, 300 by 150 by default.
					guard let link = staticAttributes["src"], let url = URL(string: link) else { throw HostError("<iframe> \(id) has no src") }
					let page = WKWebView()
					page.load(URLRequest(url: url))
					page.isAccessibilityElement = false
					page.accessibilityLabel = staticAttributes["title"]
					if layout == nil {
						page.widthAnchor.constraint(equalToConstant: staticAttributes["width"].flatMap(Double.init) ?? 300).isActive = true
						page.heightAnchor.constraint(equalToConstant: staticAttributes["height"].flatMap(Double.init) ?? 150).isActive = true
					}
					view = page
				} else if element == "img" {
					let image = ImageBox()
					// The box lays out its picture and alt text itself; the stacking layout sizes only the box.
					leaves.insert(ObjectIdentifier(image))
					view = image
				} else if element == "select" {
					if context.button != nil { throw HostError("<select> \(id) is inside a button") }
					let runtime = runtime
					let onAction = onAction
					let select = SelectButton { [weak self] in
						guard let self else { return [] }
						do {
							return try runtime.choices(of: template).map { choice in
								UIAction(title: choice.label, attributes: choice.disabled ? .disabled : [], state: choice.selected ? .on : .off) { _ in
									self.dismissMessage()
									onAction(NativeAction(event: .choose, host: choice.option))
								}
							}
						} catch { hostFailed("\(error)") }
					}
					if layout == nil {
						select.layer.borderWidth = 1
						select.layer.borderColor = UIColor.separator.cgColor
						select.layer.cornerRadius = 6
						select.widthAnchor.constraint(greaterThanOrEqualToConstant: 120).isActive = true
						select.heightAnchor.constraint(greaterThanOrEqualToConstant: 44).isActive = true
					}
					view = select
				} else if element == "option" {
					// The select's list shows its options; their views only keep their text current.
					view = UIView()
					view.isHidden = true
				} else if element == "input", staticAttributes["type"] == "hidden"
					|| (["checkbox", "radio"].contains(staticAttributes["type"]) && staticAttributes["aria-hidden"] == "true")
				{
					view = AbsentField()
				} else if element == "input", ["checkbox", "radio"].contains(staticAttributes["type"]) {
					if context.button != nil { throw HostError("<input> \(id) is inside a button") }
					if !context.suffix.isEmpty { throw HostError("a checkbox in a list row (\(id)) has no iOS host support yet") }
					let control = CheckboxButton(type: .custom)
					control.isAccessibilityElement = true
					control.accessibilityTraits = staticAttributes["type"] == "checkbox" ? [.button, .toggleButton] : .button
					ticks[id] = (staticAttributes["type"] == "radio", try runtime.isChecked(id))
					view = control
				} else if element == "input", staticAttributes["type"] == "file" {
					if context.button != nil { throw HostError("<input> \(id) is inside a button") }
					let picker = FileInputView(unseen: staticAttributes["aria-hidden"] == "true")
					picker.presenter = { [weak self] in self?.presenter }
					picker.accept = staticAttributes["accept"] ?? ""
					picker.multiple = staticAttributes["multiple"] != nil
					// A choice reaches the page whether or not the input has a handler: a form's FormData reads it.
					picker.onPick = { [onAction] files in onAction(NativeAction(event: .pick, host: id, files: files)) }
					// Its button and summary sit side by side in its own stack view, which the stacking layout leaves alone.
					leaves.insert(ObjectIdentifier(picker))
					view = picker
				} else if element == "input", staticAttributes["type"] == "range" {
					if context.button != nil { throw HostError("<input> \(id) is inside a button") }
					view = RangeSlider()
				} else if element == "input" {
					if context.button != nil { throw HostError("<input> \(id) is inside a button") }
					let field = TextField()
					if staticAttributes["type"] == "password" {
						field.isSecureTextEntry = true
						field.textContentType = .password
					}
					// Safari's keyboard for a number field: digits with the punctuation a number needs.
					if staticAttributes["type"] == "number" { field.keyboardType = .numbersAndPunctuation }
					field.lengthLimit = LengthLimit { [weak self] in nativeMaxLength(self?.attributes[id]?["maxlength"]) }
					// Safari gives an email field the email keyboard with no capitals or corrections.
					if staticAttributes["type"] == "email" {
						field.keyboardType = .emailAddress
						field.textContentType = .emailAddress
						field.autocapitalizationType = .none
						field.autocorrectionType = .no
					}
					field.addAction(UIAction { [weak self, weak field] _ in
						self?.dismissMessage()
						field?.resignFirstResponder()
					}, for: .editingDidEndOnExit)
					field.addAction(UIAction { [weak self] _ in self?.dismissMessage() }, for: .editingChanged)
					field.addAction(UIAction { [weak self, weak field] _ in
						guard let self, let field else { return }
						self.bringIntoView(field, block: focusIntoViewAlign.block, inline: focusIntoViewAlign.inline)
					}, for: .editingDidBegin)
					if layout == nil {
						field.borderStyle = .roundedRect
						field.widthAnchor.constraint(equalToConstant: 240).isActive = true
					}
					view = field
				} else if OverlayHost.isOverlay(staticAttributes) {
					let overlay = OverlayElementView()
					overlay.onEscape = { [unowned self] in self.overlays.escape() }
					view = overlay
				} else if element == "textarea" {
					if context.button != nil { throw HostError("<textarea> \(id) is inside a button") }
					let area = TextArea()
					area.onChange.append { [weak self] _ in self?.dismissMessage() }
					area.onBegin = { [weak self, weak area] in
						guard let self, let area else { return }
						self.bringIntoView(area, block: focusIntoViewAlign.block, inline: focusIntoViewAlign.inline)
					}
					if layout == nil {
						area.font = .preferredFont(forTextStyle: .body)
						area.layer.borderWidth = 1
						area.layer.borderColor = UIColor.separator.cgColor
						area.layer.cornerRadius = 5
						area.widthAnchor.constraint(equalToConstant: 240).isActive = true
						// Chrome's default `rows="2"`.
						area.heightAnchor.constraint(equalToConstant: 2 * area.font!.lineHeight + area.textContainerInset.top + area.textContainerInset.bottom).isActive = true
					}
					view = area
				} else {
					view = UIView()
					view.isUserInteractionEnabled = context.button == nil
				}
				var inner = context
				inner.button = view is SelectButton ? nil : (view as? UIButton) ?? context.button
				inner.heading = context.heading || headings.contains(element)
				inner.look = context.look.applying(node.defaultStyle)
				if layout == nil, let style = node.defaultStyle { applyBlockStyle(style, to: view) }
				if layout == nil, inner.look.centered { centered.insert(ObjectIdentifier(view)) }
				if layout == nil, element == "li", listMarkers[ObjectIdentifier(container)] != nil { addMarker(to: view) }
				view.accessibilityIdentifier = id
				elements[id] = view
				if element == "dialog" {
					// A dialog shows nothing until showModal() puts it in the top layer (the UA's dialog:not([open]) { display: none }).
					dialogIds.insert(id)
					view.isHidden = true
				}
				container.insertSubview(view, at: index)
				index += 1
				if let style = style(of: id) {
					if style.scroll != nil {
						let scroll = ContainerScrollView()
						scroll.accessibilityIdentifier = "\(id):scroll"
						view.addSubview(scroll)
						scrollViews[id] = scroll
					}
					// A text field clips its value to the editor box itself; a view over it would take its touches.
					if !(view is TextField), !(view is TextArea), style.childClip != nil || layout?.assignments.contains(where: { ($0[id] ?? $0[template])?.childClip != nil }) == true {
						let clip = PaddingClipView()
						view.addSubview(clip)
						clipViews[id] = clip
					}
					try place(id, view, style)
				}
				try wire(events[template] ?? [], on: view, element: element, id: id)
				let boundFor = try bindings.first { $0.name == "for" }.map { try runtime.evaluate($0.value, in: context.scope).text }
				if element == "label", let target = staticAttributes["for"] ?? boundFor {
					let pressable = (events[String(target.split(separator: "@", maxSplits: 1)[0])] ?? []).contains { $0.event == .activate }
					let forward = LabelForward(target: target, pressable: pressable, control: { [weak self] in self?.elements[target] }, onAction: onAction)
					forwards.append(forward)
					view.isUserInteractionEnabled = true
					view.addGestureRecognizer(UITapGestureRecognizer(target: forward, action: #selector(LabelForward.press(_:))))
				}
				var current = staticAttributes
				for binding in bindings where !binding.isProperty {
					current[binding.name] = marklessAttributeValue(binding.name, try runtime.evaluate(binding.value, in: context.scope))
				}
				attributes[id] = current
				if view is UITextField || view is TextArea {
					let bound = bindings.first { $0.isProperty && $0.name == "value" }
					let text = try bound.map { binding in
						let value = try runtime.evaluate(binding.value, in: context.scope)
						return value == .null ? "" : value.text
					} ?? current["value"]
					if let area = view as? TextArea { area.text = text ?? "" } else { (view as? UITextField)?.text = text }
				}
				var childIndex = 0
				_ = try build(template, in: scrollViews[id] ?? clipViews[id] ?? view, at: &childIndex, inner)
				applyAttributes(id, view)
				// The stacking layout sizes a control by its text; one with none (a switch's thumb) gets the 44 pt touch target.
				if layout == nil, view is UIButton, text(within: view).isEmpty {
					view.widthAnchor.constraint(greaterThanOrEqualToConstant: 44).isActive = true
					view.heightAnchor.constraint(greaterThanOrEqualToConstant: 44).isActive = true
				}
			case let .text(parts):
				let label = UILabel()
				label.isUserInteractionEnabled = false
				label.numberOfLines = 0
				label.accessibilityIdentifier = id
				label.text = try runtime.text(of: parts, in: context.scope)
				if context.button != nil {
					label.isAccessibilityElement = false
				} else if context.heading {
					label.accessibilityTraits.insert(.header)
				}
				labels[id] = label
				container.insertSubview(label, at: index)
				index += 1
				if let style = style(of: id) { try place(id, label, style) }
				if let button = context.button { refreshLabel(of: button) }
			case .branch:
				let marker = anchor(in: container, at: &index)
				let arm = try runtime.arm(of: template, in: context.scope)
				let armViews = try arm.map { try build("\(template)#\($0)", in: container, at: &index, context) } ?? []
				branches[id] = (marker, arm, armViews)
			case .repeat:
				let marker = anchor(in: container, at: &index)
				var rows: [String: [String]] = [:]
				var keys: [String] = []
				for (position, row) in try runtime.rows(of: template, in: context.scope).enumerated() {
					if rows[row.key] != nil { throw HostError("\(id) has two rows keyed \(row.key)") }
					keys.append(row.key)
					rows[row.key] = try buildRow(template, key: row.key, item: row.item, position: position, in: container, at: &index, context)
				}
				lists[id] = (marker, keys, rows)
			case let .sheet(open, snapPoints, dismissible, modal):
				if !context.suffix.isEmpty || context.button != nil { throw HostError("a system sheet inside a list row or a control (\(id)) has no iOS host support") }
				let dismissedBy = (events[template] ?? []).filter { $0.event == .dismiss }
				if dismissible && dismissedBy.isEmpty { throw HostError("system sheet \(id) can be closed by the platform but has no dismiss handler") }
				let onAction = onAction
				let sheet = SystemSheet(snapPoints: snapPoints, dismissible: dismissible, modal: modal) {
					if !dismissedBy.isEmpty { onAction(NativeAction(event: .dismiss, host: id)) }
				}
				sheet.content.accessibilityIdentifier = id
				if sheetStyles[template] != nil {
					sheet.area = { [weak self] snapPoint in self?.sheetArea(template, at: snapPoint) }
					sheet.onRest = { [weak self] snapPoint in
						do { try self?.sheetRested(template, at: snapPoint) } catch { hostFailed("\(error)") }
					}
				} else if layout != nil {
					throw HostError("system sheet \(id) is on a styled page but has no styles of its own")
				}
				var childIndex = 0
				_ = try build(template, in: sheet.content, at: &childIndex, Context())
				sheets[id] = sheet
				if layout == nil { unstacked.insert(id) }
				if try runtime.evaluate(open).isTruthy { sheet.open(from: presenter) }
			}
		}
		return built
	}

	/// `id` is the view's own id, a row's copy included (`<node>@<key>`): the runtime runs the handler in that row.
	private func wire(_ bound: [NativeEvent], on view: UIView, element: String, id: String) throws {
		let onAction = onAction
		let ask = ask
		for event in bound {
			if event.event == .submit { continue }
			switch (event.event, view) {
			case let (.activate, control as UIButton):
				// UIKit's own count of quick taps in one place: a touch down starts it, a repeated touch down adds one.
				let taps = TapCount()
				control.addAction(UIAction { _ in taps.value = 1 }, for: .touchDown)
				control.addAction(UIAction { _ in taps.value += 1 }, for: .touchDownRepeat)
				control.addAction(UIAction { [weak self] _ in
					// As Safari does: the press blurs the focused field, then the click lands on the button.
					self?.page.endEditing(true)
					onAction(NativeAction(event: .activate, host: id, detail: taps.value))
				}, for: .touchUpInside)
			case (.activate, _) where !(view is UITextField || view is TextArea):
				// An element that is not a button (a list row): a tap anywhere in it, its text included, presses it.
				view.isUserInteractionEnabled = true
				view.addGestureRecognizer(ActivateGesture { taps in onAction(NativeAction(event: .activate, host: id, detail: taps)) })
			case (.input, is FileInputView): break
			case let (.input, slider as RangeSlider):
				slider.onInput = { value in onAction(NativeAction(event: .input, host: id, value: value)) }
			case let (.commit, slider as RangeSlider):
				slider.onCommit = { value in onAction(NativeAction(event: .commit, host: id, value: value)) }
			case let (.input, field as UITextField):
				field.addAction(
					UIAction { [weak field] _ in onAction(NativeAction(event: .input, host: id, value: field?.text ?? "")) },
					for: .editingChanged)
			case let (.input, area as TextArea):
				area.onChange.append { text in onAction(NativeAction(event: .input, host: id, value: text)) }
			case let (.focus, field as UITextField):
				field.addAction(UIAction { _ in onAction(NativeAction(event: .focus, host: id)) }, for: .editingDidBegin)
			case let (.blur, field as UITextField):
				field.addAction(UIAction { _ in onAction(NativeAction(event: .blur, host: id)) }, for: .editingDidEnd)
			case let (.focus, area as TextArea):
				area.onFocus.append { onAction(NativeAction(event: .focus, host: id)) }
			case let (.blur, area as TextArea):
				area.onBlur.append { onAction(NativeAction(event: .blur, host: id)) }
			case let (.keydown, field as TextField):
				field.onKey = { key in ask(NativeAction(event: .keydown, host: id, value: key)) }
			case let (.keydown, area as TextArea):
				area.onKey = { key in ask(NativeAction(event: .keydown, host: id, value: key)) }
			case let (.keyup, field as TextField):
				field.onKeyUp = { key in onAction(NativeAction(event: .keyup, host: id, value: key)) }
			case let (.keyup, area as TextArea):
				area.onKeyUp = { key in onAction(NativeAction(event: .keyup, host: id, value: key)) }
			case let (.paste, field as TextField):
				field.onPaste = { text in ask(NativeAction(event: .paste, host: id, value: text)) }
			case let (.paste, area as TextArea):
				area.onPaste = { text in ask(NativeAction(event: .paste, host: id, value: text)) }
			case let (.enter, field as UITextField):
				field.addAction(UIAction { _ in onAction(NativeAction(event: .enter, host: id)) }, for: .editingDidEndOnExit)
			case (.input, _ as SelectButton):
				// A select's change runs in the runtime when a choice is made (a `choose` action).
				continue
			case (.idle, _), (.visible, _), (.dismiss, _), (.close, _), (.keydown, _), (.animationstart, _), (.animationiteration, _), (.animationend, _), (.animationcancel, _), (_, _) where event.event.isPointer:
				// Raised elsewhere: idle, visible and animation events by the screen's controller, dismiss and pointer events by the overlay host, close and a keydown off a text field by the runtime.
				continue
			case (.contextmenu, _):
				// Safari on iOS raises no contextmenu for a long press, so neither does this host.
				continue
			default:
				throw HostError("\(event.event.rawValue) on <\(element)> \(id) has no iOS control event yet")
			}
		}
	}

	private func remove(_ id: String) {
		sheets.removeValue(forKey: id)?.close(animated: false)
		if let branch = branches.removeValue(forKey: id) {
			for inner in branch.built { remove(inner) }
			anchors.remove(ObjectIdentifier(branch.anchor))
			branch.anchor.removeFromSuperview()
		} else if let list = lists.removeValue(forKey: id) {
			for inner in list.built.values.joined() { remove(inner) }
			anchors.remove(ObjectIdentifier(list.anchor))
			list.anchor.removeFromSuperview()
		} else if let template = templates[id] {
			let suffix = String(id.dropFirst(template.count))
			for child in slots[template] ?? [] { remove(child + suffix) }
		}
		labels.removeValue(forKey: id)?.removeFromSuperview()
		scrollViews.removeValue(forKey: id)
		shadows.removeValue(forKey: id)?.remove()
		outlines.removeValue(forKey: id)?.removeFromSuperview()
		paragraphs.removeValue(forKey: id)?.view.removeFromSuperview()
		paragraphTexts.removeValue(forKey: id)
		flowing.remove(id)
		if let view = elements.removeValue(forKey: id) {
			stackConstraints.removeValue(forKey: ObjectIdentifier(view))
			view.removeFromSuperview()
		}
		contexts.removeValue(forKey: id)
		restacked.removeValue(forKey: id)
		templates.removeValue(forKey: id)
		attributes.removeValue(forKey: id)
	}

	/// Static and bound attributes as platform state; `class` reaches views only through the style export.
	private func applyAttributes(_ id: String, _ view: UIView) {
		let current = attributes[id] ?? [:]
		// A control's name is read from its content, so an attribute inside it (hidden, aria-label) renames it.
		defer { if let button = contexts[id]?.button, button !== view { refreshLabel(of: button) } }
		if view is AbsentField { return }
		if let slider = view as? RangeSlider {
			slider.show(current)
		} else if let audio = view as? AudioButton {
			audio.isHidden = current["controls"] == nil
			audio.update(source: current["src"], label: current["aria-label"])
		} else if let button = view as? UIButton {
			button.isEnabled = current["disabled"] == nil
			refreshLabel(of: button)
		} else if let drawing = view as? DrawingView {
			// A named svg is an image to VoiceOver, and one with text reads its text, as the browser exposes them; an unnamed one
			// without text, or one inside a control, is decoration.
			let label = current["aria-label"] ?? drawing.drawing.label
			drawing.accessibilityLabel = label
			drawing.isAccessibilityElement = label != nil && contexts[id]?.button == nil
			drawing.accessibilityTraits = current["aria-label"] != nil ? .image : .staticText
		} else if let box = view as? ImageBox {
			let src = current["src"]
			// A photo the device took is a `file:` URL; any other src is a file the app packaged when it was built.
			let packaged = src.flatMap { images[$0] }
			let image = packaged?.picture
				?? src.flatMap { URL(string: $0) }.flatMap { $0.isFileURL ? UIImage(contentsOfFile: $0.path) : nil }
			let natural = packaged.flatMap { p in p.width.flatMap { w in p.height.map { CGSize(width: w, height: $0) } } }
			let length = { (name: String) in current[name].flatMap { Double($0.trimmingCharacters(in: .whitespaces)) } }
			box.show(
				image, drawing: packaged?.drawing, natural: natural ?? image?.size, width: length("width"), height: length("height"),
				alt: current["alt"], sized: layout == nil)
			if box.fillsWidth { fullWidth.insert(ObjectIdentifier(box)) } else { fullWidth.remove(ObjectIdentifier(box)) }
			box.accessibilityLabel = current["aria-label"] ?? current["alt"]
			// `alt=""` marks a decorative image, which a screen reader skips, as the web leaves it out of the tree.
			box.isAccessibilityElement = current["aria-label"] != nil || current["alt"].map { !$0.isEmpty } ?? true
		} else {
			view.accessibilityLabel = current["aria-label"]
		}
		if let field = view as? UITextField { field.isEnabled = current["disabled"] == nil }
		if let field = view as? TextField { field.readOnly = current["readonly"] != nil }
		if let area = view as? TextArea { area.isEditable = current["disabled"] == nil && current["readonly"] == nil }
		// aria-disabled only reads as dimmed: a press still reaches the button, as on the web.
		let disabled = (view is UIButton || view is UITextField || view is TextArea) && current["disabled"] != nil
		if disabled || current["aria-disabled"] == "true" {
			view.accessibilityTraits.insert(.notEnabled)
		} else {
			view.accessibilityTraits.remove(.notEnabled)
		}
		if ticks[id] != nil {
			drawTick(id, view)
		} else if current["role"] == "switch" {
			if #available(iOS 17.0, *) { view.accessibilityTraits.insert(.toggleButton) }
			view.accessibilityValue = current["aria-checked"] == "true" ? "1" : "0"
			return
		} else {
			if current["aria-pressed"] == "true" || current["aria-selected"] == "true" {
				view.accessibilityTraits.insert(.selected)
			} else {
				view.accessibilityTraits.remove(.selected)
			}
			view.accessibilityValue = current["aria-expanded"].map { $0 == "true" ? "expanded" : "collapsed" }
		}
		disclosures[ObjectIdentifier(view)]?.text = current["aria-expanded"] == "true" ? "\u{25BE}" : "\u{25B8}"
		view.accessibilityElementsHidden = current["aria-hidden"] == "true"
		// With a style export Dragon decides visibility (a hidden element has no frame); the stacking layout reads `hidden`.
		if layout == nil, !dialogIds.contains(id) {
			// An option shows only in its select's list.
			let hidden = current["hidden"] != nil || view.superview is SelectButton
			if view.isHidden != hidden {
				view.isHidden = hidden
				if contexts[id]?.button != nil {
					let labels = hideLabels(in: view, hidden)
					stackTree(view)
					if hidden {
						for label in labels {
							label.translatesAutoresizingMaskIntoConstraints = true
							label.frame = .zero
						}
					}
				}
				if let parent = view.superview, !(parent is SelectButton || parent is OverlayCard) { stack(parent) }
			}
		}
	}

	/// A hidden element inside a control has no layout, as `display: none`: UIKit's automation tree lists a control's labels
	/// at their frames whatever their `isHidden`, so each label under it is hidden and unplaced. One under a still-hidden
	/// element stays so.
	private func hideLabels(in view: UIView, _ hidden: Bool) -> [UILabel] {
		view.subviews.filter { !decorations.contains(ObjectIdentifier($0)) && !leaves.contains(ObjectIdentifier($0)) }.flatMap { child -> [UILabel] in
			if let label = child as? UILabel {
				label.isHidden = hidden
				return [label]
			}
			return child.isHidden ? [] : hideLabels(in: child, hidden)
		}
	}

	private func drawTick(_ id: String, _ view: UIView) {
		guard let tick = ticks[id], let button = view as? UIButton else { return }
		button.accessibilityValue = tick.checked ? "1" : "0"
		if let box = button as? CheckboxButton {
			box.show(checked: tick.checked)
			if box.themed { return }
		}
		let symbol = tick.radio ? (tick.checked ? "largecircle.fill.circle" : "circle") : (tick.checked ? "checkmark.square.fill" : "square")
		button.setImage(UIImage(systemName: symbol), for: .normal)
	}

	/// Each select shows its chosen option's label, as the web's closed `<select>` does.
	private func refreshSelects() {
		for (id, view) in elements {
			guard let select = view as? SelectButton, let template = templates[id] else { continue }
			do {
				select.show(try runtime.choices(of: template).first { $0.selected }?.label ?? "")
			} catch { hostFailed("\(error)") }
		}
	}

	/// A button reads as its `aria-label`, or else its text in view order; a select reads as its `aria-label` and its choice.
	private func refreshLabel(of button: UIButton) {
		if button is SelectButton {
			button.accessibilityLabel = button.accessibilityIdentifier.flatMap { attributes[$0]?["aria-label"] }
			return
		}
		if let id = button.accessibilityIdentifier, let label = attributes[id]?["aria-label"] {
			button.accessibilityLabel = label
			return
		}
		// As the web names a button from its content: its shown text, and the label of an element, image or svg inside it.
		func texts(_ view: UIView) -> [String] {
			view.subviews.flatMap { child -> [String] in
				if let label = child as? UILabel {
					if decorations.contains(ObjectIdentifier(label)) { return [] }
					if let id = label.accessibilityIdentifier, let paragraph = paragraphs[id], paragraph.label === label { return [spokenName(of: paragraph)] }
					return [label.text ?? ""]
				}
				let own = child.accessibilityIdentifier.flatMap { attributes[$0] }
				if child.isHidden || own?["hidden"] != nil || own?["aria-hidden"] == "true" { return [] }
				if child is DrawingView || child is UIImageView {
					return [own?["aria-label"] ?? (child is UIImageView ? own?["alt"] : nil) ?? ""]
				}
				if let label = own?["aria-label"] { return [label] }
				return texts(child)
			}
		}
		button.accessibilityLabel = texts(button).joined().split(whereSeparator: \.isWhitespace).joined(separator: " ")
	}

	/// A paragraph's part of a control's name, as the web reads it: without hidden or aria-hidden phrase elements, and an
	/// element's aria-label in place of its text.
	private func spokenName(of paragraph: Paragraph) -> String {
		func walk(_ template: String) -> String {
			guard let node = nodes[template] else { return "" }
			if node.isText { return paragraphTexts[template + paragraph.suffix] ?? "" }
			if node.defaultStyle?.flow == .break { return " " }
			let own = attributes[template + paragraph.suffix] ?? [:]
			if own["hidden"] != nil || own["aria-hidden"] == "true" { return "" }
			if let label = own["aria-label"] { return label }
			let inner = (slots[template] ?? []).map(walk).joined()
			return node.defaultStyle?.quotes == true ? "\u{201C}\(inner)\u{201D}" : inner
		}
		return paragraph.nodes.map(walk).joined()
	}

	private func stackTree(_ view: UIView) {
		guard !(view is UILabel || view is UITextField || view is TextArea || view is AudioButton), !leaves.contains(ObjectIdentifier(view)) else { return }
		stack(view)
		for child in view.subviews where !anchors.contains(ObjectIdentifier(child)) { stackTree(child) }
	}

	/// The temporary layout for rungs without Dragon: children top to bottom, start-aligned.
	private func stack(_ container: UIView) {
		NSLayoutConstraint.deactivate(stackConstraints[ObjectIdentifier(container)] ?? [])
		if tableRows.contains(ObjectIdentifier(container)) {
			stackRow(container)
			return
		}
		var constraints: [NSLayoutConstraint] = []
		var above = container.topAnchor
		let indent = indents[ObjectIdentifier(container)] ?? 0
		let middle = centered.contains(ObjectIdentifier(container))
		var top = container
		while let parent = top.superview { top = parent }
		for child in stacked(container) {
			child.translatesAutoresizingMaskIntoConstraints = false
			let wide = fullWidth.contains(ObjectIdentifier(child))
			constraints += [
				child.topAnchor.constraint(equalTo: above),
				middle && !wide
					? child.centerXAnchor.constraint(equalTo: container.centerXAnchor, constant: indent / 2)
					: child.leadingAnchor.constraint(equalTo: container.leadingAnchor, constant: indent),
				wide
					? child.trailingAnchor.constraint(equalTo: container.trailingAnchor)
					: child.trailingAnchor.constraint(lessThanOrEqualTo: container.trailingAnchor),
			]
			if middle && !wide { constraints.append(child.leadingAnchor.constraint(greaterThanOrEqualTo: container.leadingAnchor, constant: indent)) }
			if wide {
				// As wide as the page allows: a box with no width of its own (a rule, a code block) takes the line.
				let page = child.widthAnchor.constraint(equalTo: top.widthAnchor)
				page.priority = .defaultHigh
				constraints.append(page)
			}
			above = child.bottomAnchor
		}
		constraints.append(above.constraint(equalTo: container.bottomAnchor))
		NSLayoutConstraint.activate(constraints)
		stackConstraints[ObjectIdentifier(container)] = constraints
		if let kind = listMarkers[ObjectIdentifier(container)] {
			var number = 0
			for child in stacked(container) {
				guard let marker = itemMarkers[ObjectIdentifier(child)] else { continue }
				number += 1
				marker.text = kind == "decimal" ? "\(number)." : "\u{2022}"
			}
		}
	}

	/// The children the stacking layout places: not anchors, decorations (a marker, a rule's line) or hidden views.
	private func stacked(_ container: UIView) -> [UIView] {
		container.subviews.filter { child in
			!anchors.contains(ObjectIdentifier(child)) && !decorations.contains(ObjectIdentifier(child)) && !child.isHidden
		}
	}

	/// A table row: its cells side by side, top-aligned; `alignTables` makes each column as wide as its widest cell.
	private func stackRow(_ row: UIView) {
		var constraints: [NSLayoutConstraint] = []
		var leading = row.leadingAnchor
		let cells = stacked(row)
		for (index, cell) in cells.enumerated() {
			cell.translatesAutoresizingMaskIntoConstraints = false
			let fit = row.bottomAnchor.constraint(equalTo: cell.bottomAnchor)
			fit.priority = .defaultLow
			let narrow = cell.widthAnchor.constraint(equalToConstant: 0)
			narrow.priority = .defaultLow
			constraints += [
				cell.topAnchor.constraint(equalTo: row.topAnchor),
				cell.leadingAnchor.constraint(equalTo: leading, constant: index == 0 ? 0 : 12),
				row.bottomAnchor.constraint(greaterThanOrEqualTo: cell.bottomAnchor),
				fit,
				narrow,
			]
			leading = cell.trailingAnchor
		}
		if cells.isEmpty { constraints.append(row.topAnchor.constraint(equalTo: row.bottomAnchor)) }
		else { constraints.append(leading.constraint(lessThanOrEqualTo: row.trailingAnchor)) }
		NSLayoutConstraint.activate(constraints)
		stackConstraints[ObjectIdentifier(row)] = constraints
	}

	/// Lines each table's cells up in columns across all its rows (thead, tbody, tfoot and list rows alike).
	private func alignTables() {
		for table in tableViews.values {
			NSLayoutConstraint.deactivate(columnConstraints[ObjectIdentifier(table)] ?? [])
			var rows: [UIView] = []
			func collect(_ view: UIView) {
				for child in stacked(view) {
					if tableRows.contains(ObjectIdentifier(child)) { rows.append(child) }
					else if !tables.contains(ObjectIdentifier(child)) { collect(child) }
				}
			}
			collect(table)
			let columns = rows.map { stacked($0) }
			var constraints: [NSLayoutConstraint] = []
			for column in 0..<(columns.map(\.count).max() ?? 0) {
				let cells = columns.compactMap { $0.count > column ? $0[column] : nil }
				for cell in cells.dropFirst() { constraints.append(cell.widthAnchor.constraint(equalTo: cells[0].widthAnchor)) }
			}
			NSLayoutConstraint.activate(constraints)
			columnConstraints[ObjectIdentifier(table)] = constraints
		}
	}

	/// The stacking layout's part of an element's default style: insets, rules, list markers and table structure.
	private func applyBlockStyle(_ style: NativeDefaultStyle, to view: UIView) {
		let id = ObjectIdentifier(view)
		if let indent = style.indent { indents[id] = CGFloat(indent) }
		if style.rule {
			// Chrome's hr: a 1 px inset line with 0.5em above and below.
			leaves.insert(id)
			fullWidth.insert(id)
			view.isAccessibilityElement = false
			view.heightAnchor.constraint(equalToConstant: 17).isActive = true
			let line = UIView()
			line.backgroundColor = .systemGray3
			line.translatesAutoresizingMaskIntoConstraints = false
			view.addSubview(line)
			decorations.insert(ObjectIdentifier(line))
			NSLayoutConstraint.activate([
				line.leadingAnchor.constraint(equalTo: view.leadingAnchor),
				line.trailingAnchor.constraint(equalTo: view.trailingAnchor),
				line.centerYAnchor.constraint(equalTo: view.centerYAnchor),
				line.heightAnchor.constraint(equalToConstant: 1),
			])
		}
		if let marker = style.marker { listMarkers[id] = marker }
		if style.disclosure { addDisclosure(to: view) }
		switch style.table {
		case "table":
			tables.insert(id)
			tableViews[id] = view
		case "row": tableRows.insert(id)
		case "cell": tableCells.insert(id)
		default: break
		}
	}

	/// A summary's triangle (`list-style: disclosure-closed inside`), in an inset before its content; it is not read.
	private func addDisclosure(to summary: UIView) {
		let marker = UILabel()
		marker.isAccessibilityElement = false
		marker.isUserInteractionEnabled = false
		marker.translatesAutoresizingMaskIntoConstraints = false
		marker.text = "\u{25B8}"
		summary.addSubview(marker)
		decorations.insert(ObjectIdentifier(marker))
		disclosures[ObjectIdentifier(summary)] = marker
		let glyphs = ["\u{25B8} ", "\u{25BE} "].map { ($0 as NSString).size(withAttributes: [.font: marker.font as Any]).width }
		indents[ObjectIdentifier(summary)] = ceil(glyphs.max() ?? 0)
		NSLayoutConstraint.activate([
			marker.leadingAnchor.constraint(equalTo: summary.leadingAnchor),
			marker.topAnchor.constraint(equalTo: summary.topAnchor),
		])
	}

	/// A list item's marker, beside it in its list's inset; it is neither read nor part of the item's text.
	private func addMarker(to item: UIView) {
		let marker = UILabel()
		marker.isAccessibilityElement = false
		marker.isUserInteractionEnabled = false
		marker.translatesAutoresizingMaskIntoConstraints = false
		item.addSubview(marker)
		decorations.insert(ObjectIdentifier(marker))
		itemMarkers[ObjectIdentifier(item)] = marker
		NSLayoutConstraint.activate([
			marker.trailingAnchor.constraint(equalTo: item.leadingAnchor, constant: -6),
			marker.topAnchor.constraint(equalTo: item.topAnchor),
		])
	}

	/// A run of text nodes and phrase elements as one label (`nativeParagraphs`), kept current by `render`.
	private func buildParagraph(_ run: [String], in container: UIView, at index: inout Int, _ context: Context) throws -> [String] {
		let label = UILabel()
		label.isUserInteractionEnabled = false
		label.numberOfLines = 0
		if context.look.centered { label.textAlignment = .center }
		label.accessibilityIdentifier = run[0] + context.suffix
		if context.button != nil {
			label.isAccessibilityElement = false
		} else if context.heading {
			label.accessibilityTraits.insert(.header)
		}
		var outer: UIView = label
		if context.look.preformatted {
			let scroll = PreformattedScroll()
			scroll.alwaysBounceVertical = false
			scroll.showsVerticalScrollIndicator = false
			label.translatesAutoresizingMaskIntoConstraints = false
			scroll.addSubview(label)
			NSLayoutConstraint.activate([
				label.leadingAnchor.constraint(equalTo: scroll.contentLayoutGuide.leadingAnchor),
				label.trailingAnchor.constraint(equalTo: scroll.contentLayoutGuide.trailingAnchor),
				label.topAnchor.constraint(equalTo: scroll.contentLayoutGuide.topAnchor),
				label.bottomAnchor.constraint(equalTo: scroll.contentLayoutGuide.bottomAnchor),
				scroll.frameLayoutGuide.heightAnchor.constraint(equalTo: scroll.contentLayoutGuide.heightAnchor),
			])
			leaves.insert(ObjectIdentifier(scroll))
			fullWidth.insert(ObjectIdentifier(scroll))
			outer = scroll
		}
		// A table cell is as wide as its text: the column widens rather than wrapping a short word.
		if tableCells.contains(ObjectIdentifier(container)) {
			label.setContentCompressionResistancePriority(.required - 1, for: .horizontal)
			// A fixed wrap width keeps UIKit from wrapping at the narrow width it tries first.
			label.preferredMaxLayoutWidth = root.window?.windowScene?.screen.bounds.width ?? 390
		}
		let paragraph = Paragraph(nodes: run, suffix: context.suffix, look: context.look, label: label, view: outer)
		func register(_ template: String) throws {
			let id = template + context.suffix
			templates[id] = template
			contexts[id] = context
			paragraphs[id] = paragraph
			switch nodes[template]!.kind {
			case let .text(parts):
				paragraphTexts[id] = try runtime.text(of: parts, in: context.scope)
				labels[id] = label
			case let .element(_, staticAttributes, bindings):
				flowing.insert(id)
				var current = staticAttributes
				for binding in bindings where !binding.isProperty {
					current[binding.name] = marklessAttributeValue(binding.name, try runtime.evaluate(binding.value, in: context.scope))
				}
				attributes[id] = current
				for child in slots[template] ?? [] { try register(child) }
			default:
				throw HostError("\(id) cannot flow in a paragraph")
			}
		}
		for template in run { try register(template) }
		try render(paragraph)
		container.insertSubview(outer, at: index)
		index += 1
		if let button = context.button { refreshLabel(of: button) }
		return run.map { $0 + context.suffix }
	}

	private enum Piece {
		case text(String, TextLook)
		case lineBreak
	}

	/// The paragraph's text from its current values: each phrase element's look on its text, `<br>` a new line, `<q>` in
	/// quotes, and whitespace collapsed as CSS `white-space: normal` does, except in preformatted text.
	private func render(_ paragraph: Paragraph) throws {
		var pieces: [Piece] = []
		func walk(_ template: String, _ look: TextLook) {
			guard let node = nodes[template] else { return }
			if node.isText {
				pieces.append(.text(paragraphTexts[template + paragraph.suffix] ?? "", look))
				return
			}
			let style = node.defaultStyle
			if style?.flow == .break {
				pieces.append(.lineBreak)
				return
			}
			let inner = look.applying(style)
			if style?.quotes == true { pieces.append(.text("\u{201C}", inner)) }
			for child in slots[template] ?? [] { walk(child, inner) }
			if style?.quotes == true { pieces.append(.text("\u{201D}", inner)) }
		}
		for template in paragraph.nodes { walk(template, paragraph.look) }
		let out = NSMutableAttributedString()
		var run = ""
		var runLook = paragraph.look
		func flush() {
			if !run.isEmpty { out.append(NSAttributedString(string: run, attributes: runLook.attributes)) }
			run = ""
		}
		func emit(_ text: String, _ look: TextLook) {
			if look != runLook { flush(); runLook = look }
			run += text
		}
		let preformatted = paragraph.look.preformatted
		var pending: TextLook?
		var atLineStart = true
		for piece in pieces {
			switch piece {
			case .lineBreak:
				pending = nil
				emit("\n", paragraph.look)
				atLineStart = true
			case let .text(text, look):
				if preformatted {
					emit(text, look)
					continue
				}
				for character in text {
					if [" ", "\t", "\n", "\r", "\r\n", "\u{0C}"].contains(character) {
						if pending == nil { pending = look }
						continue
					}
					if let space = pending, !atLineStart { emit(" ", space) }
					pending = nil
					atLineStart = false
					emit(String(character), look)
				}
			}
		}
		flush()
		paragraph.label.attributedText = out
		// UIKit's own label for a UILabel reads its line breaks as spaces; the text a person reads keeps them.
		paragraph.label.accessibilityLabel = out.string
	}
}

/// `<audio controls>`: a button reading "Play", or "Pause" while its file plays.
@MainActor
/// Where a box moved into its stacking parent's view was built: its home view and the view after it there.
final class Restacked {
	weak var home: UIView?
	weak var next: UIView?
	init(home: UIView, next: UIView?) {
		self.home = home
		self.next = next
	}
}

final class AudioButton: UIButton, AVAudioPlayerDelegate {
	private var player: AVAudioPlayer?
	private var source: String?
	private var label: String?

	init() {
		super.init(frame: .zero)
		configuration = .plain()
		isAccessibilityElement = true
		accessibilityTraits = .button
		addAction(UIAction { [weak self] _ in self?.toggle() }, for: .touchUpInside)
		refresh()
	}

	@available(*, unavailable)
	required init?(coder: NSCoder) { fatalError("AudioButton is made in code") }

	/// A new `src` replaces the player; `label` (`aria-label`) is read instead of the title.
	func update(source: String?, label: String?) {
		self.label = label
		if source != self.source {
			self.source = source
			player?.stop()
			player = nil
		}
		refresh()
	}

	private func toggle() {
		if let player, player.isPlaying {
			player.pause()
		} else {
			if player == nil, let url = source.flatMap(URL.init(string:)) {
				player = try? AVAudioPlayer(contentsOf: url)
				player?.delegate = self
			}
			player?.play()
		}
		refresh()
	}

	private func refresh() {
		let title = player?.isPlaying == true ? "Pause" : "Play"
		configuration?.title = title
		accessibilityLabel = label ?? title
	}

	nonisolated func audioPlayerDidFinishPlaying(_ player: AVAudioPlayer, successfully flag: Bool) {
		Task { @MainActor in self.refresh() }
	}
}

/// The top layer's view: VoiceOver's escape gesture (two-finger scrub) on it closes the dialog.
/// A closed `<select>`: its chosen option's label; a press opens the list of its options as a menu, as Safari shows one.
final class SelectButton: UIButton {
	private let display = UILabel()

	init(choices: @escaping () -> [UIAction]) {
		super.init(frame: .zero)
		isAccessibilityElement = true
		accessibilityTraits = .button
		display.numberOfLines = 1
		display.isAccessibilityElement = false
		display.isUserInteractionEnabled = false
		addSubview(display)
		showsMenuAsPrimaryAction = true
		menu = UIMenu(children: [UIDeferredMenuElement.uncached { completion in completion(choices()) }])
	}

	@available(*, unavailable)
	required init?(coder: NSCoder) { fatalError("init(coder:) is not used") }

	func show(_ label: String) {
		display.text = label
		accessibilityValue = label
	}

	private let arrow = CAShapeLayer()

	/// On a styled page: the label in Dragon's box for it, vertically centred, and Dragon's arrow stroked over the background
	/// and under the border, as Chrome paints a menulist-button.
	func paint(arrow paint: ResolvedStyle.SelectArrowPaint?, label: ResolvedStyle.SelectLabel?, faces: [String: UIFontDescriptor]) throws {
		if let label {
			guard let face = faces[label.fontFamily] else { throw HostError("font \(label.fontFamily) was not registered") }
			display.font = UIFont(descriptor: face, size: label.fontSize)
			if let color = label.color { display.textColor = uiColor(color) }
			display.lineBreakMode = .byClipping
			display.frame = CGRect(x: label.frame.x, y: label.frame.y, width: label.frame.width, height: label.frame.height)
		}
		display.isHidden = label == nil
		guard let paint else {
			arrow.removeFromSuperlayer()
			return
		}
		let a = paint.arrow
		let point = { (k: Int) in CGPoint(x: (a.originX + a.points[k]) / paint.scale, y: (a.originY + a.points[k + 1]) / paint.scale) }
		let path = CGMutablePath()
		path.move(to: point(0))
		for k in stride(from: 2, to: a.points.count, by: 2) { path.addLine(to: point(k)) }
		arrow.path = path
		arrow.fillColor = nil
		arrow.strokeColor = uiColor(paint.color).cgColor
		arrow.lineWidth = a.strokeWidth / paint.scale
		arrow.lineCap = .butt
		arrow.lineJoin = .miter
		arrow.miterLimit = 4
		arrow.frame = bounds
		arrow.contentsScale = paint.scale
		if arrow.superlayer == nil { layer.addSublayer(arrow) }
	}
}

final class TopLayerView: UIView {
	var onEscape: (() -> Void)?
	override func accessibilityPerformEscape() -> Bool {
		onEscape?()
		return onEscape != nil
	}
}

/// Stops typing at a field's `maxlength` as the web does: an insertion is cut to fit, never through a surrogate pair, while
/// text the app sets is kept whole. Text an input method is still composing is left to it.
@MainActor
/// `<input type="range">`: a track and a round thumb drawn as Safari draws an unstyled range input, on the input's steps,
/// its value kept as the web keeps it (`nativeRangeValue`). A drag reports the value it lands on once, as the web's input
/// event does while the thumb crosses a step; VoiceOver adjusts it a step at a time.
final class RangeSlider: UIControl {
	var onInput: ((String) -> Void)?
	/// Called when a drag or tap ends with the value moved since it began, as the web's `change`.
	var onCommit: ((String) -> Void)?
	private var startValue = ""
	private var attributes: [String: String] = [:]
	private var reported = ""
	private var low = 0.0
	private var high = 100.0
	private var value = 50.0
	private let track = CALayer()
	private let fill = CALayer()
	private let thumb = CALayer()
	private static let thumbSize: CGFloat = 24

	override init(frame: CGRect) {
		super.init(frame: frame)
		track.backgroundColor = UIColor.systemGray4.cgColor
		track.cornerRadius = 2
		fill.backgroundColor = UIColor.systemBlue.cgColor
		fill.cornerRadius = 2
		thumb.backgroundColor = UIColor.white.cgColor
		thumb.cornerRadius = Self.thumbSize / 2
		thumb.shadowColor = UIColor.black.cgColor
		thumb.shadowOpacity = 0.3
		thumb.shadowRadius = 2
		thumb.shadowOffset = CGSize(width: 0, height: 1)
		for part in [track, fill, thumb] { layer.addSublayer(part) }
		isAccessibilityElement = true
		accessibilityTraits = .adjustable
		// The stacking layout would squeeze it to nothing; it keeps a thumb's height.
		setContentCompressionResistancePriority(.required, for: .vertical)
		heightAnchor.constraint(greaterThanOrEqualToConstant: 31).isActive = true
		addGestureRecognizer(UIPanGestureRecognizer(target: self, action: #selector(dragged(_:))))
		addGestureRecognizer(UITapGestureRecognizer(target: self, action: #selector(dragged(_:))))
	}

	required init?(coder: NSCoder) { fatalError("RangeSlider is built in code") }

	/// Chrome's unstyled range input is 129 px wide.
	override var intrinsicContentSize: CGSize { CGSize(width: 129, height: 31) }

	private func valueOf(_ raw: String?) -> String {
		nativeRangeValue(raw, min: attributes["min"], max: attributes["max"], step: attributes["step"])
	}

	/// Takes the input's attributes: its range, its step and the value the page gives it.
	func show(_ current: [String: String]) {
		attributes = current
		low = Double(valueOf(current["min"] ?? "0")) ?? 0
		high = Double(valueOf(current["max"] ?? "100")) ?? 100
		reported = valueOf(current["value"])
		value = Double(reported) ?? low
		isEnabled = current["disabled"] == nil
		accessibilityLabel = current["aria-label"]
		setNeedsLayout()
	}

	override func layoutSubviews() {
		super.layoutSubviews()
		CATransaction.begin()
		CATransaction.setDisableActions(true)
		let inset = Self.thumbSize / 2
		let line = CGRect(x: inset, y: bounds.midY - 2, width: Swift.max(0, bounds.width - 2 * inset), height: 4)
		track.frame = line
		let fraction = high > low ? CGFloat((value - low) / (high - low)) : 0
		let x = line.minX + line.width * fraction
		fill.frame = CGRect(x: line.minX, y: line.minY, width: x - line.minX, height: line.height)
		thumb.frame = CGRect(x: x - inset, y: bounds.midY - inset, width: Self.thumbSize, height: Self.thumbSize)
		CATransaction.commit()
	}

	@objc private func dragged(_ gesture: UIGestureRecognizer) {
		guard isEnabled else { return }
		if gesture.state == .began || (gesture is UITapGestureRecognizer && gesture.state == .ended) { startValue = reported }
		defer {
			if gesture.state == .ended || gesture.state == .cancelled, reported != startValue {
				startValue = reported
				onCommit?(reported)
			}
		}
		let inset = Self.thumbSize / 2
		let width = Swift.max(1, bounds.width - 2 * inset)
		let fraction = Swift.min(1, Swift.max(0, (gesture.location(in: self).x - inset) / width))
		land(on: valueOf(String(low + (high - low) * Double(fraction))))
	}

	private func land(on landed: String) {
		value = Double(landed) ?? value
		setNeedsLayout()
		guard landed != reported else { return }
		reported = landed
		onInput?(landed)
	}

	/// VoiceOver moves the thumb a step: the step, or a hundredth of the range for `step="any"`.
	private var stepSize: Double {
		let step = attributes["step"]?.trimmingCharacters(in: .whitespaces)
		if step?.lowercased() == "any" { return (high - low) / 100 }
		return step.flatMap(Double.init).flatMap { $0 > 0 ? $0 : nil } ?? 1
	}

	/// VoiceOver reads the value the input holds.
	override var accessibilityValue: String? {
		get { reported }
		set {}
	}

	/// A VoiceOver step is a move that ends at once, as a keyboard step on the web raises input and then change.
	private func step(by delta: Double) {
		let before = reported
		land(on: valueOf(String(value + delta)))
		if reported != before { onCommit?(reported) }
	}

	override func accessibilityIncrement() { step(by: stepSize) }
	override func accessibilityDecrement() { step(by: -stepSize) }

	/// The value as a number, for the host's tests.
	var number: Double { value }
}

final class LengthLimit: NSObject, UITextFieldDelegate {
	private let limit: () -> Int?

	init(limit: @escaping () -> Int?) { self.limit = limit }

	func textField(_ field: UITextField, shouldChangeCharactersIn range: NSRange, replacementString string: String) -> Bool {
		guard field.markedTextRange == nil, let max = limit() else { return true }
		let current = (field.text ?? "") as NSString
		let inserted = string as NSString
		let room = Swift.max(0, max - (current.length - range.length))
		if inserted.length <= room { return true }
		var cut = room
		if cut > 0, UTF16.isLeadSurrogate(inserted.character(at: cut - 1)) { cut -= 1 }
		if cut == 0, range.length == 0 { return false }
		field.text = current.replacingCharacters(in: range, with: inserted.substring(to: cut))
		if let caret = field.position(from: field.beginningOfDocument, offset: range.location + cut) {
			field.selectedTextRange = field.textRange(from: caret, to: caret)
		}
		field.sendActions(for: .editingChanged)
		return false
	}
}

/// Sends a label's tap to the control its `for` names.
@MainActor
final class LabelForward: NSObject {
	private let target: String
	private let pressable: Bool
	private let control: () -> UIView?
	private let onAction: (NativeAction) -> Void
	init(target: String, pressable: Bool, control: @escaping () -> UIView?, onAction: @escaping (NativeAction) -> Void) {
		self.target = target
		self.pressable = pressable
		self.control = control
		self.onAction = onAction
	}
	/// As a browser: a text field takes the keyboard; focus leaves the field that had it for any other control, which is pressed when
	/// a press acts on it (a checkbox, a button) and only focused otherwise (a select), which a phone does not show.
	@objc func press(_ gesture: UITapGestureRecognizer) {
		if let field = control(), field is UITextField || field is UITextView {
			field.becomeFirstResponder()
			return
		}
		gesture.view?.window?.endEditing(true)
		if pressable { onAction(NativeAction(event: .activate, host: target)) }
	}
}

/// A tap or drag outside a field puts the keyboard away, as a scrolling screen does.
@MainActor
final class KeyboardDismisser: NSObject, UIGestureRecognizerDelegate {
	private weak var root: UIView?
	init(_ root: UIView) { self.root = root }
	@objc func dismiss() { root?.endEditing(true) }

	/// A tap on a control is that control's: it blurs the field itself as it acts, after its touch has ended in place.
	func gestureRecognizer(_ gestureRecognizer: UIGestureRecognizer, shouldReceive touch: UITouch) -> Bool {
		var view = touch.view
		while let v = view, v !== root {
			if v is UIControl { return false }
			view = v.superview
		}
		return true
	}
}

@MainActor
private func paint(_ view: UIView, _ style: ResolvedStyle, faces: [String: UIFontDescriptor]) throws {
	if view is AbsentField { return }
	// Dragon gives an element it does not render (`display: none`, `[hidden]`) no frame.
	guard let frame = style.frame else {
		view.isHidden = true
		return
	}
	view.isHidden = false
	view.frame = CGRect(x: frame.x, y: frame.y, width: frame.width, height: frame.height)
	view.backgroundColor = style.background.map(uiColor) ?? .clear
	view.layer.borderWidth = style.borderWidth
	view.layer.borderColor = style.borderColor.map(uiColor)?.cgColor
	view.layer.cornerRadius = style.cornerRadius
	// A replaced element's content is clipped to its (rounded) box, as CSS clips a camera's or an image's picture.
	view.clipsToBounds = (style.clipsChildren && style.childClip == nil) || view is CameraPreviewView
	// Siblings draw by zPosition: in-flow boxes at 0, negative z-index below them, positioned boxes above in their context's order.
	view.layer.zPosition = style.paintOrder.map { CGFloat($0.bucket) * 100_000 + CGFloat($0.rank) + 1 } ?? 0
	// A layer mask clips the box and its subviews without touching their accessibility, as Chrome keeps clipped text exposed.
	if let r = style.clipRect {
		let mask = view.layer.mask ?? CALayer()
		mask.backgroundColor = UIColor.black.cgColor
		mask.frame = CGRect(x: r.x, y: r.y, width: r.width, height: r.height)
		view.layer.mask = mask
	} else {
		view.layer.mask = nil
	}
	paintSides(view, style.sides, radius: style.cornerRadius)
	paintDashed(view, style.dashedBorder)
	if let drawing = view as? DrawingView {
		// An svg's text colour is what its currentColor paints.
		if let color = style.textColor { drawing.currentColor = uiColor(color) }
		drawing.isHidden = style.hidden
		return
	}
	if let select = view as? SelectButton {
		try select.paint(arrow: style.selectArrow, label: style.selectLabel, faces: faces)
		return
	}
	if let box = view as? CheckboxButton {
		box.paint(style.checkbox)
		return
	}
	if let field = view as? TextField {
		try field.paint(style.textField, faces: faces)
		return
	}
	if let area = view as? TextArea {
		try area.paint(style.textField, faces: faces)
		return
	}
	if style.checkbox != nil { throw HostError("\(view.accessibilityIdentifier ?? "a box") draws a themed checkbox but is not a checkbox") }
	guard let label = view as? UILabel else {
		if style.font != nil || style.textColor != nil { throw HostError("\(view.accessibilityIdentifier ?? "a box") has text styles but is not text") }
		return
	}
	if let font = style.font {
		guard let face = faces[font.family] else { throw HostError("font \(font.family) was not registered") }
		label.font = UIFont(descriptor: face, size: font.size)
	}
	if let color = style.textColor { label.textColor = uiColor(color) }
	// Text that is not visible keeps its place but neither shows nor reads out, as the web hides it.
	label.isHidden = style.hidden
}

/// A text node's lines drawn glyph for glyph at Dragon's positions in the platform's own font (`CTFontDrawGlyphs`).
final class GlyphLinesLayer: CALayer {
	var lines: [TextLine] = []
	var faces: [String: SystemFace] = [:]
	/// The app's own font files, whose glyph ids are the ones Dragon shaped them to.
	var webFaces: [String: UIFontDescriptor] = [:]
	var textColor: UIColor = .black
	/// How far the layer reaches past the label on every side, in points.
	var slack: CGFloat = 0

	override func draw(in ctx: CGContext) {
		ctx.saveGState()
		ctx.textMatrix = .identity
		ctx.translateBy(x: 0, y: bounds.height)
		ctx.scaleBy(x: 1, y: -1)
		ctx.setFillColor(textColor.cgColor)
		for line in lines {
			for run in line.runs {
				let font: CTFont
				if let face = faces[run.face] {
					font = systemFont(face, size: run.size)
				} else if let face = webFaces[run.face] {
					font = CTFontCreateWithFontDescriptor(face as CTFontDescriptor, run.size, nil)
				} else { continue }
				let glyphs = run.glyphs.map { CGGlyph($0) }
				let positions = run.xs.map { CGPoint(x: $0 + slack, y: bounds.height - (line.baseline + slack)) }
				CTFontDrawGlyphs(font, glyphs, positions, glyphs.count, ctx)
			}
		}
		ctx.restoreGState()
	}
}

/// A system face at a size in points, built as Dragon's build-time helper built it.
func systemFont(_ face: SystemFace, size: Double) -> CTFont {
	switch face {
	case let .system(weight, design):
		let base = UIFont.systemFont(ofSize: size, weight: UIFont.Weight(rawValue: weight))
		guard design != "default", let d = base.fontDescriptor.withDesign(design == "serif" ? .serif : .monospaced) else { return base as CTFont }
		return UIFont(descriptor: d, size: size) as CTFont
	case let .named(name):
		return CTFontCreateWithName(name as CFString, size, nil)
	}
}

private func uiColor(_ color: RGBA) -> UIColor {
	UIColor(red: color.r / 255, green: color.g / 255, blue: color.b / 255, alpha: color.alpha / 255)
}
/// One sublayer per side, for borders whose sides differ; Chrome's diagonal corner joins are not drawn. A rounded box's sides,
/// which share a colour, are one ring between its outer corners and its padding box.
@MainActor
private func paintSides(_ view: UIView, _ sides: [ResolvedStyle.Side]?, radius: Double) {
	let name = "markless-border-side"
	view.layer.sublayers?.filter { $0.name == name }.forEach { $0.removeFromSuperlayer() }
	guard let sides else { return }
	let b = view.bounds
	if radius > 0, let color = sides.first(where: { $0.width > 0 })?.color {
		let inner = PaddingBox(radius: radius, top: sides[0].width, right: sides[1].width, bottom: sides[2].width, left: sides[3].width)
		let ring = CAShapeLayer()
		ring.name = name
		ring.frame = b
		let path = CGMutablePath()
		path.addPath(roundedPath(b, Array(repeating: PaddingBox.Corner(x: radius, y: radius), count: 4)))
		path.addPath(paddingBoxPath(inner, in: b))
		ring.path = path
		ring.fillRule = .evenOdd
		ring.fillColor = uiColor(color).cgColor
		view.layer.addSublayer(ring)
		return
	}
	let rects = [
		CGRect(x: 0, y: 0, width: b.width, height: sides[0].width),
		CGRect(x: b.width - sides[1].width, y: 0, width: sides[1].width, height: b.height),
		CGRect(x: 0, y: b.height - sides[2].width, width: b.width, height: sides[2].width),
		CGRect(x: 0, y: 0, width: sides[3].width, height: b.height),
	]
	for (side, rect) in zip(sides, rects) where side.width > 0 {
		let layer = CALayer()
		layer.name = name
		layer.frame = rect
		layer.backgroundColor = uiColor(side.color).cgColor
		view.layer.addSublayer(layer)
	}
}

/// A dashed or dotted border, drawn from Dragon's operations as Dragon's own UIKit paint draws them (dragonDrawBorderOps).
@MainActor
private func paintDashed(_ view: UIView, _ border: ResolvedStyle.DashedBorder?) {
	let name = "markless-border-ops"
	view.layer.sublayers?.filter { $0.name == name }.forEach { $0.removeFromSuperlayer() }
	guard let border else { return }
	let layer = DashedBorderLayer(border)
	layer.name = name
	layer.frame = view.bounds
	layer.contentsScale = view.traitCollection.displayScale
	view.layer.addSublayer(layer)
	layer.setNeedsDisplay()
}

private final class DashedBorderLayer: CALayer {
	private var border: ResolvedStyle.DashedBorder?
	init(_ border: ResolvedStyle.DashedBorder) {
		self.border = border
		super.init()
	}
	override init(layer: Any) {
		border = (layer as? DashedBorderLayer)?.border
		super.init(layer: layer)
	}
	required init?(coder: NSCoder) { fatalError("not built from a coder") }

	override func draw(in ctx: CGContext) {
		guard let border else { return }
		drawBorderOps(ctx, border.ops.ops, colors: border.colors, scale: border.scale, dx: border.ops.originX, dy: border.ops.originY)
	}
}

/// Dragon's side-painter operations (paint-dash.ts) in device px, shifted by dx, dy, as Dragon's own UIKit paint draws them.
func drawBorderOps(_ ctx: CGContext, _ ops: [BorderOps.Op], colors: [RGBA], scale: Double, dx: Double, dy: Double) {
	ctx.saveGState()
	ctx.scaleBy(x: 1 / scale, y: 1 / scale)
	ctx.translateBy(x: dx, y: dy)
	for o in ops {
		let pts = o.points
		switch o.op {
		case "begin-layer":
			ctx.saveGState()
			ctx.setAlpha(o.alpha)
			ctx.beginTransparencyLayer(auxiliaryInfo: nil)
		case "end-layer":
			ctx.endTransparencyLayer()
			ctx.restoreGState()
		case "save": ctx.saveGState()
		case "restore": ctx.restoreGState()
		case "clip":
			ctx.setShouldAntialias(o.antialias)
			ctx.addPath(polygon(pts))
			ctx.clip()
			ctx.setShouldAntialias(true)
		default:
			let c = colors[o.side]
			ctx.setFillColor(UIColor(red: c.r / 255, green: c.g / 255, blue: c.b / 255, alpha: o.alpha).cgColor)
			ctx.setShouldAntialias(o.antialias)
			if o.op == "fill" {
				ctx.addPath(polygon(pts))
				ctx.fillPath()
			} else {
				ctx.fillEllipse(in: CGRect(x: pts[0] - pts[2], y: pts[1] - pts[2], width: 2 * pts[2], height: 2 * pts[2]))
			}
			ctx.setShouldAntialias(true)
		}
	}
	ctx.restoreGState()
}

private func polygon(_ pts: [Double]) -> CGPath {
	let path = CGMutablePath()
	path.addLines(between: stride(from: 0, to: pts.count - 1, by: 2).map { CGPoint(x: pts[$0], y: pts[$0 + 1]) })
	path.closeSubpath()
	return path
}

/// A checkbox or radio button. On a styled page a checkbox draws Chrome's theme marks from Dragon's plan, in the checkedness the
/// runtime keeps (`show`); otherwise the platform's symbol.
final class CheckboxButton: UIButton {
	private var drawn: CheckboxLayer?
	private var checked = false
	var themed: Bool { drawn != nil }

	func show(checked: Bool) {
		self.checked = checked
		drawn?.checked = checked
		drawn?.setNeedsDisplay()
	}

	func paint(_ paint: ResolvedStyle.CheckboxPaint?) {
		guard let paint else {
			drawn?.removeFromSuperlayer()
			drawn = nil
			return
		}
		let marks = drawn ?? CheckboxLayer()
		marks.paint = paint
		marks.checked = checked
		marks.frame = bounds
		marks.contentsScale = paint.scale
		// Over the background and under the border, as Chrome paints the theme's checkbox.
		if drawn == nil { layer.insertSublayer(marks, at: 0) }
		drawn = marks
		setImage(nil, for: .normal)
		marks.setNeedsDisplay()
	}

	override func layoutSubviews() {
		super.layoutSubviews()
		drawn?.frame = bounds
	}
}

/// Dragon's `dragonPaintCheckbox`: the marks in device px from the snapped border box.
private final class CheckboxLayer: CALayer {
	var paint: ResolvedStyle.CheckboxPaint?
	var checked = false

	override func draw(in ctx: CGContext) {
		guard let paint else { return }
		let m = paint.marks, c = paint.colors
		ctx.saveGState()
		ctx.scaleBy(x: 1 / paint.scale, y: 1 / paint.scale)
		ctx.translateBy(x: m.originX, y: m.originY)
		ctx.setShouldAntialias(true)
		let square = CGRect(x: m.x, y: m.y, width: m.side, height: m.side)
		let rounded = { (r: CGRect) -> CGPath in
			let k = min(CGFloat(m.radius), min(r.width, r.height) / 2)
			return CGPath(roundedRect: r, cornerWidth: k, cornerHeight: k, transform: nil)
		}
		if m.plain {
			ctx.setFillColor(uiColor(checked ? c.check : c.uncheckedBorder).cgColor)
			ctx.fill(square)
			ctx.restoreGState()
			return
		}
		let inset = CGFloat(m.backgroundInset)
		ctx.addPath(rounded(square.insetBy(dx: inset, dy: inset)))
		ctx.setFillColor(uiColor(checked ? c.checkedBackground : c.uncheckedBackground).cgColor)
		ctx.fillPath()
		if checked {
			ctx.addPath(rounded(square))
			ctx.setFillColor(uiColor(c.fill).cgColor)
			ctx.fillPath()
			let p = m.check
			ctx.move(to: CGPoint(x: p[0], y: p[1]))
			ctx.addLine(to: CGPoint(x: p[2], y: p[3]))
			ctx.addLine(to: CGPoint(x: p[4], y: p[5]))
			ctx.setLineWidth(CGFloat(m.checkWidth))
			ctx.setLineCap(.butt)
			ctx.setLineJoin(.miter)
			ctx.setMiterLimit(4)
			ctx.setStrokeColor(uiColor(c.check).cgColor)
			ctx.strokePath()
		} else {
			let border = CGFloat(m.borderInset)
			ctx.addPath(rounded(square.insetBy(dx: border, dy: border)))
			ctx.setLineWidth(CGFloat(m.borderWidth))
			ctx.setStrokeColor(uiColor(c.uncheckedBorder).cgColor)
			ctx.strokePath()
		}
		ctx.restoreGState()
	}
}

/// A checkbox or hidden `<input>`: the form reads its state, the screen shows nothing for it.
private final class AbsentField: UIView {
	override init(frame: CGRect) {
		super.init(frame: frame)
		isHidden = true
		isUserInteractionEnabled = false
		isAccessibilityElement = false
		accessibilityElementsHidden = true
	}

	@available(*, unavailable)
	required init?(coder: NSCoder) { fatalError("an absent field is built by the view factory") }
}

/// Reports the start of every touch on the screen, then steps aside so no other gesture or control is held up.
private final class TouchWatcher: UIGestureRecognizer {
	private let began: () -> Void
	init(_ began: @escaping () -> Void) {
		self.began = began
		super.init(target: nil, action: nil)
		cancelsTouchesInView = false
		delaysTouchesEnded = false
	}

	override func touchesBegan(_ touches: Set<UITouch>, with event: UIEvent) {
		began()
		state = .failed
	}
}

/// Every touch on the page, observed for Dragon's interaction runtime: it never recognises, so it takes no touch from a control.
private final class InteractionWatcher: UIGestureRecognizer, UIGestureRecognizerDelegate {
	enum Phase { case began, ended, cancelled }
	private let report: (Phase, CGPoint) -> Void
	init(_ report: @escaping (Phase, CGPoint) -> Void) {
		self.report = report
		super.init(target: nil, action: nil)
		cancelsTouchesInView = false
		delaysTouchesBegan = false
		delaysTouchesEnded = false
		delegate = self
	}

	/// The finger the runtime follows (the first down; others are ignored), where and when it went down.
	private var finger: (touch: UITouch, at: CGPoint, time: TimeInterval)?
	/// Past this the finger scrolls: Chrome cancels the press (pointercancel), and the lift focuses nothing.
	private let slop: CGFloat = 10
	/// A finger held this long is a long press, whose lift is not a tap, as in Chrome.
	private let longPress: TimeInterval = 0.5

	override func touchesBegan(_ touches: Set<UITouch>, with event: UIEvent) {
		guard finger == nil, let touch = touches.first, let view else { return }
		let at = touch.location(in: view)
		finger = (touch, at, touch.timestamp)
		report(.began, at)
	}

	override func touchesMoved(_ touches: Set<UITouch>, with event: UIEvent) {
		guard let finger, touches.contains(finger.touch), let view else { return }
		let at = finger.touch.location(in: view)
		if hypot(at.x - finger.at.x, at.y - finger.at.y) > slop { end(.cancelled, .zero) }
	}

	override func touchesEnded(_ touches: Set<UITouch>, with event: UIEvent) {
		guard let finger, touches.contains(finger.touch), let view else { return }
		if finger.touch.timestamp - finger.time >= longPress { end(.cancelled, .zero) } else { end(.ended, finger.touch.location(in: view)) }
	}

	override func touchesCancelled(_ touches: Set<UITouch>, with event: UIEvent) {
		guard let finger, touches.contains(finger.touch) else { return }
		end(.cancelled, .zero)
	}

	private func end(_ phase: Phase, _ at: CGPoint) {
		finger = nil
		report(phase, at)
		state = .failed
	}

	override func reset() {
		super.reset()
		finger = nil
	}

	func gestureRecognizer(_ a: UIGestureRecognizer, shouldRecognizeSimultaneouslyWith b: UIGestureRecognizer) -> Bool { true }
}

/// A tap that presses an element which is not a button.
private final class ActivateGesture: UITapGestureRecognizer {
	private let action: (Int) -> Void
	/// UIKit's own count of quick taps in one place (`UITouch.tapCount`), which is a press's `event.detail`.
	private var taps = 1
	init(_ action: @escaping (Int) -> Void) {
		self.action = action
		super.init(target: nil, action: nil)
		addTarget(self, action: #selector(fire))
	}
	override func touchesEnded(_ touches: Set<UITouch>, with event: UIEvent) {
		taps = touches.first?.tapCount ?? 1
		super.touchesEnded(touches, with: event)
	}
	@objc private func fire() { if state == .ended { action(taps) } }
}

/// How many quick taps in one place a button's current press is: its `event.detail`.
final class TapCount { var value = 1 }

/// The children of a box that clips overflow past its borders: a view over the whole box masked to its padding box, so the
/// box's own border and background are not clipped and its children keep their frames.
@MainActor
final class PaddingClipView: UIView {
	func shape(_ box: PaddingBox?, in bounds: CGRect) {
		frame = bounds
		guard let box else {
			layer.mask = nil
			return
		}
		CATransaction.begin()
		CATransaction.setDisableActions(true)
		let mask = layer.mask as? CAShapeLayer ?? CAShapeLayer()
		mask.frame = bounds
		mask.path = paddingBoxPath(box, in: bounds)
		layer.mask = mask
		CATransaction.commit()
	}
}

func paddingBoxPath(_ box: PaddingBox, in bounds: CGRect) -> CGPath {
	let rect = CGRect(
		x: box.left, y: box.top, width: max(0, bounds.width - box.left - box.right), height: max(0, bounds.height - box.top - box.bottom))
	return roundedPath(rect, box.corners)
}

/// A rect with each corner (from the top left, clockwise) a quarter ellipse of its radii; a corner with a zero radius is square.
func roundedPath(_ r: CGRect, _ corners: [PaddingBox.Corner]) -> CGPath {
	let path = CGMutablePath()
	let vertices = [CGPoint(x: r.minX, y: r.minY), CGPoint(x: r.maxX, y: r.minY), CGPoint(x: r.maxX, y: r.maxY), CGPoint(x: r.minX, y: r.maxY)]
	let inward: [(x: CGFloat, y: CGFloat)] = [(1, 1), (-1, 1), (-1, -1), (1, -1)]
	let rounded = corners.map { $0.x > 0 && $0.y > 0 }
	path.move(to: rounded[0] ? CGPoint(x: r.minX + corners[0].x, y: r.minY) : vertices[0])
	for k in [1, 2, 3, 0] {
		guard rounded[k] else {
			path.addLine(to: vertices[k])
			continue
		}
		let c = corners[k]
		let center = CGPoint(x: vertices[k].x + inward[k].x * c.x, y: vertices[k].y + inward[k].y * c.y)
		path.addRelativeArc(
			center: .zero, radius: 1, startAngle: CGFloat(k + 2) * .pi / 2, delta: .pi / 2,
			transform: CGAffineTransform(translationX: center.x, y: center.y).scaledBy(x: c.x, y: c.y))
	}
	path.closeSubpath()
	return path
}

/// A scroll container's scroll view over its padding box. A drag that starts toward an edge it is already at goes to the
/// scroll view around it, as the web chains a scroll to the page once a box is at its end.
@MainActor
final class ContainerScrollView: UIScrollView {
	private(set) var inset: (top: Double, left: Double, bottom: Double, right: Double) = (0, 0, 0, 0)

	func configure(_ scroll: ResolvedScroll, in box: CGSize, cornerRadius: Double) {
		inset = scroll.inset
		contentInsetAdjustmentBehavior = .never
		let port = CGSize(width: box.width - inset.left - inset.right, height: box.height - inset.top - inset.bottom)
		frame = CGRect(x: inset.left, y: inset.top, width: port.width, height: port.height)
		contentSize = CGSize(
			width: port.width + (scroll.x ? scroll.range.maxX : 0), height: port.height + (scroll.y ? scroll.range.maxY : 0))
		contentOffset = CGPoint(x: min(contentOffset.x, contentSize.width - port.width), y: min(contentOffset.y, contentSize.height - port.height))
		showsVerticalScrollIndicator = scroll.indicators
		showsHorizontalScrollIndicator = scroll.indicators
		bouncesVertically = scroll.bounceY
		bouncesHorizontally = scroll.bounceX
		layer.cornerRadius = max(0, cornerRadius - min(inset.top, inset.left))
	}

	override func gestureRecognizerShouldBegin(_ gesture: UIGestureRecognizer) -> Bool {
		guard gesture === panGestureRecognizer else { return super.gestureRecognizerShouldBegin(gesture) }
		let velocity = panGestureRecognizer.velocity(in: self)
		let vertical = abs(velocity.y) >= abs(velocity.x)
		let at = vertical ? contentOffset.y : contentOffset.x
		let end = vertical ? contentSize.height - bounds.height : contentSize.width - bounds.width
		let toward = vertical ? -velocity.y : -velocity.x
		if (toward > 0 && at >= end - 0.5) || (toward < 0 && at <= 0.5) { return false }
		return super.gestureRecognizerShouldBegin(gesture)
	}
}

/// Keys and pastes as Safari on iOS reports them for the on-screen keyboard: each typed character is its own key, a delete is
/// `Backspace` (in an empty field too), Return is `Enter`. Each callback answers whether the handler called `preventDefault()`,
/// which leaves out what the key or paste would do. `onKeyUp` runs after the key's edit, or after it was left out.
@MainActor protocol KeyedInput: AnyObject {
	var onKey: ((String) -> Bool)? { get }
	var onKeyUp: ((String) -> Void)? { get }
	var onPaste: ((String) -> Bool)? { get }
}

extension KeyedInput {
	func keyName(_ text: String) -> String { text == "\n" ? "Enter" : text }
	/// The key's keydown, then `edit` unless the handler prevented it, then its keyup.
	func press(_ key: String, _ edit: () -> Void) {
		if onKey?(key) != true { edit() }
		onKeyUp?(key)
	}
	func pasteLeavesOut() -> Bool { onPaste?(UIPasteboard.general.string ?? "") ?? false }
}

/// An `<input>`'s field, whose `keydown` and `paste` handlers run before the key or paste edits it. Return reaches it as
/// `textFieldShouldReturn`, not as typed text; a prevented Return neither returns nor puts the keyboard away.
final class TextField: UITextField, KeyedInput, UITextFieldDelegate {
	var onKey: ((String) -> Bool)?
	var onKeyUp: ((String) -> Void)?
	var onPaste: ((String) -> Bool)?

	override init(frame: CGRect) {
		super.init(frame: frame)
		delegate = self
	}

	@available(*, unavailable)
	required init?(coder: NSCoder) { fatalError("init(coder:) is not used") }

	override func insertText(_ text: String) {
		if text == "\n" { return super.insertText(text) }
		press(keyName(text)) { super.insertText(text) }
	}

	func textFieldShouldReturn(_ textField: UITextField) -> Bool {
		let prevented = onKey?("Enter") == true
		// UIKit returns (change, then the implicit submit) after this answer; Safari's keyup comes after both.
		if let keyUp = onKeyUp { DispatchQueue.main.async { keyUp("Enter") } }
		return !prevented
	}

	/// The field is its own delegate, so `maxlength` is asked here.
	var lengthLimit: LengthLimit?
	/// `readonly`: the field takes focus and selection but no typing, and brings up no keyboard, as Safari's does.
	var readOnly = false {
		didSet { inputView = readOnly ? UIView() : nil }
	}

	func textField(_ field: UITextField, shouldChangeCharactersIn range: NSRange, replacementString string: String) -> Bool {
		!readOnly && (lengthLimit?.textField(field, shouldChangeCharactersIn: range, replacementString: string) ?? true)
	}

	override func deleteBackward() {
		press("Backspace") { super.deleteBackward() }
	}

	override func paste(_ sender: Any?) {
		if pasteLeavesOut() { return }
		super.paste(sender)
	}

	private var styled: ResolvedStyle.TextFieldPaint?

	/// On a styled page: the value and caret in Dragon's editor box, in its font and colour, and Dragon's placeholder in its box.
	func paint(_ paint: ResolvedStyle.TextFieldPaint?, faces: [String: UIFontDescriptor]) throws {
		let font = { (family: String, size: Double) throws -> UIFont in
			guard let face = faces[family] else { throw HostError("font \(family) was not registered") }
			return UIFont(descriptor: face, size: size)
		}
		if let paint {
			self.font = try font(paint.fontFamily, paint.fontSize)
			if let color = paint.color { textColor = uiColor(color) }
		}
		attributedPlaceholder = try paint?.placeholder.map { shown in
			var look: [NSAttributedString.Key: Any] = [.font: try font(shown.fontFamily, shown.fontSize)]
			if let color = shown.color { look[.foregroundColor] = uiColor(color) }
			return NSAttributedString(string: shown.text, attributes: look)
		}
		styled = paint
		clearButtonMode = paint?.clear == nil ? .never : .whileEditing
		setNeedsLayout()
	}

	/// The clear button empties the field as typing does, so the page's input handler sees it, as Chrome's cancel button fires input.
	func textFieldShouldClear(_ textField: UITextField) -> Bool {
		text = ""
		sendActions(for: .editingChanged)
		return false
	}

	override func clearButtonRect(forBounds bounds: CGRect) -> CGRect {
		rect(styled?.clear, or: super.clearButtonRect(forBounds: bounds))
	}

	private func rect(_ frame: Frame?, or fallback: CGRect) -> CGRect {
		frame.map { CGRect(x: $0.x, y: $0.y, width: $0.width, height: $0.height) } ?? fallback
	}

	/// The editor box's columns at the height UIKit asks for, moved by how far the box's middle is from the field's: UIKit centres
	/// the line there, and draws no value or caret in a rect it did not size itself.
	private func valueRect(_ bounds: CGRect) -> CGRect? {
		guard let editor = styled?.editor else { return nil }
		let shift = editor.y + editor.height / 2 - self.bounds.midY
		return CGRect(x: editor.x, y: bounds.minY + shift, width: editor.width, height: bounds.height)
	}

	override func textRect(forBounds bounds: CGRect) -> CGRect { valueRect(bounds) ?? super.textRect(forBounds: bounds) }
	override func editingRect(forBounds bounds: CGRect) -> CGRect { valueRect(bounds) ?? super.editingRect(forBounds: bounds) }
	override func placeholderRect(forBounds bounds: CGRect) -> CGRect {
		rect(styled?.placeholder?.frame ?? styled?.editor, or: super.placeholderRect(forBounds: bounds))
	}
}

/// A `<textarea>`: a text view that reports each edit as a text field's `editingChanged` does; Return adds a line.
final class TextArea: UITextView, UITextViewDelegate, KeyedInput {
	var onChange: [(String) -> Void] = []
	var onKey: ((String) -> Bool)?
	var onKeyUp: ((String) -> Void)?
	var onPaste: ((String) -> Bool)?
	var onBegin: (() -> Void)?
	var onFocus: [() -> Void] = []
	var onBlur: [() -> Void] = []

	init() {
		super.init(frame: .zero, textContainer: nil)
		delegate = self
		isScrollEnabled = true
	}

	@available(*, unavailable)
	required init?(coder: NSCoder) { fatalError("init(coder:) is not used") }

	override func insertText(_ text: String) {
		press(keyName(text)) { super.insertText(text) }
	}

	override func deleteBackward() {
		press("Backspace") { super.deleteBackward() }
	}

	override func paste(_ sender: Any?) {
		if pasteLeavesOut() { return }
		super.paste(sender)
	}

	func textViewDidChange(_ textView: UITextView) {
		placeholderLabel.isHidden = !text.isEmpty
		for change in onChange { change(text) }
	}

	private var styled: ResolvedStyle.TextFieldPaint?
	private let placeholderLabel = UILabel()

	/// On a styled page: the text in Dragon's font and colour, inset to the editor box, its lines Dragon's pitch apart with the first
	/// baseline where Dragon puts it, and Dragon's placeholder in its box while the text is empty.
	func paint(_ paint: ResolvedStyle.TextFieldPaint?, faces: [String: UIFontDescriptor]) throws {
		styled = paint
		guard let paint else { return }
		let font = { (family: String, size: Double) throws -> UIFont in
			guard let face = faces[family] else { throw HostError("font \(family) was not registered") }
			return UIFont(descriptor: face, size: size)
		}
		let own = try font(paint.fontFamily, paint.fontSize)
		var look: [NSAttributedString.Key: Any] = [.font: own]
		if let color = paint.color { look[.foregroundColor] = uiColor(color) }
		if let lines = paint.lines {
			let spacing = NSMutableParagraphStyle()
			spacing.minimumLineHeight = lines.pitch
			spacing.maximumLineHeight = lines.pitch
			look[.paragraphStyle] = spacing
			// TextKit sets a fixed-height line's baseline at its height plus the face's descender; Dragon's is `above` below the top.
			look[.baselineOffset] = lines.pitch + own.descender - lines.above
		}
		typingAttributes = look
		attributedText = NSAttributedString(string: text, attributes: look)
		textContainer.lineFragmentPadding = 0
		if let shown = paint.placeholder {
			placeholderLabel.text = shown.text
			placeholderLabel.font = try font(shown.fontFamily, shown.fontSize)
			placeholderLabel.textColor = shown.color.map(uiColor) ?? .placeholderText
			placeholderLabel.isAccessibilityElement = false
			if placeholderLabel.superview == nil { addSubview(placeholderLabel) }
		} else {
			placeholderLabel.removeFromSuperview()
		}
		placeholderLabel.isHidden = !text.isEmpty
		setNeedsLayout()
	}

	/// While empty, the placeholder is the value read out, as a text field's is.
	override var accessibilityValue: String? {
		get { text.isEmpty && placeholderLabel.superview != nil ? placeholderLabel.text : super.accessibilityValue }
		set { super.accessibilityValue = newValue }
	}

	override func layoutSubviews() {
		super.layoutSubviews()
		guard let paint = styled else { return }
		let e = paint.editor
		let bottom = paint.lines.map { $0.insets[2] + e.y - $0.insets[0] } ?? e.y
		textContainerInset = UIEdgeInsets(top: e.y, left: e.x, bottom: bottom, right: bounds.width - e.x - e.width)
		if let shown = paint.placeholder {
			placeholderLabel.frame = CGRect(x: shown.frame.x, y: shown.frame.y, width: shown.frame.width, height: shown.frame.height)
		}
	}

	func textViewDidBeginEditing(_ textView: UITextView) {
		onBegin?()
		for focus in onFocus { focus() }
	}

	func textViewDidEndEditing(_ textView: UITextView) {
		for blur in onBlur { blur() }
	}
}
#endif
