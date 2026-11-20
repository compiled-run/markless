#if canImport(UIKit)
import AVFoundation
import MarklessCore
import UIKit
import UIKit.UIGestureRecognizerSubclass

private let headings: Set<String> = ["h1", "h2", "h3", "h4", "h5", "h6"]
private let unimplementedElements: Set<String> = [
	"canvas", "details", "embed", "iframe", "object",
	"picture", "summary", "video",
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
	var link = false

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
		next.link = link || style.link
		return next
	}

	/// Chrome's LinkText: #0000ee, or #9e9eff when dark.
	static let linkText = UIColor {
		$0.userInterfaceStyle == .dark ? UIColor(red: 158 / 255, green: 158 / 255, blue: 1, alpha: 1) : UIColor(red: 0, green: 0, blue: 238 / 255, alpha: 1)
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
		if link { attributes[.foregroundColor] = TextLook.linkText }
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

/// An inline `<svg>`: draws the shapes compiled when the app was built, fitted into its box as the web fits the viewBox.
final class DrawingView: UIView {
	let drawing: NativeDrawing
	var currentColor: UIColor = .black { didSet { setNeedsDisplay() } }

	init(_ drawing: NativeDrawing) {
		self.drawing = drawing
		super.init(frame: .zero)
		isOpaque = false
		backgroundColor = .clear
		contentMode = .redraw
	}

	@available(*, unavailable)
	required init?(coder: NSCoder) { fatalError("DrawingView is made in code") }

	override func draw(_ rect: CGRect) {
		guard let context = UIGraphicsGetCurrentContext() else { return }
		if let box = drawing.viewBox?.map({ CGFloat($0) }), box[2] > 0, box[3] > 0 {
			// SVG 2 xMidYMid meet: one scale that fits both axes, the rest centred.
			let scale = min(bounds.width / box[2], bounds.height / box[3])
			context.translateBy(x: -box[0] * scale + (bounds.width - box[2] * scale) / 2, y: -box[1] * scale + (bounds.height - box[3] * scale) / 2)
			context.scaleBy(x: scale, y: scale)
		}
		for shape in drawing.shapes {
			let path = CGMutablePath()
			var i = 0
			let p = shape.path
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
			context.saveGState()
			if let t = shape.transform { context.concatenate(CGAffineTransform(a: t[0], b: t[1], c: t[2], d: t[3], tx: t[4], ty: t[5])) }
			if let fill = shape.fill {
				context.addPath(path)
				context.setFillColor(color(fill).cgColor)
				context.fillPath(using: shape.evenOdd ? .evenOdd : .winding)
			}
			if let stroke = shape.stroke, shape.width > 0 {
				context.addPath(path)
				context.setStrokeColor(color(stroke).cgColor)
				context.setLineWidth(shape.width)
				context.setLineCap(shape.cap == "round" ? .round : shape.cap == "square" ? .square : .butt)
				context.setLineJoin(shape.join == "round" ? .round : shape.join == "bevel" ? .bevel : .miter)
				context.setMiterLimit(shape.miterLimit)
				context.strokePath()
			}
			context.restoreGState()
		}
	}

	private func color(_ paint: NativeShape.Paint) -> UIColor {
		switch paint {
		case .currentColor: currentColor
		case let .color(c): UIColor(red: c.r / 255, green: c.g / 255, blue: c.b / 255, alpha: c.alpha / 255)
		}
	}
}

/// The retained views of one payload: built by the view factory, then changed only by `apply(_:)`.
@MainActor
final class ViewTree {
	/// The browser's `body { margin: 8px }`.
	static let bodyMargin: CGFloat = 8
	let root = UIView()
	/// The page's own scroll view, as a browser's viewport: it fills the screen, insets its content by the safe areas and
	/// scrolls it under the bars.
	let page = UIScrollView()
	let keyboard: KeyboardDismisser
	private let runtime: NativeRuntime
	private let layout: StyleLayout?
	private let faces: [String: UIFontDescriptor]
	private let onAction: (NativeAction) -> Void
	/// Runs a text field's `keydown` or `paste` and answers whether its handler called `preventDefault()`.
	private let ask: (NativeAction) -> Bool
	/// The view of a device object (a camera's preview), made by the page's device.
	private let objectView: (_ object: String, _ device: String) throws -> UIView
	private let nodes: [String: NativeNode]
	/// The nodes each element, root (`""`), branch arm (`branch#index`) or list row (`repeat id`) places directly.
	private let slots: [String: [String]]
	private let events: [String: [NativeEvent]]
	private(set) var elements: [String: UIView] = [:]
	private(set) var labels: [String: UILabel] = [:]
	private var contexts: [String: Context] = [:]
	private var templates: [String: String] = [:]
	private var attributes: [String: [String: String]] = [:]
	private var branches: [String: (anchor: UIView, index: Int?, built: [String])] = [:]
	/// Timers the page set and has not fired or cleared, by the name its `timer` entries give.
	private var timers: [String: Task<Void, Never>] = [:]
	private var lists: [String: (anchor: UIView, keys: [String], built: [String: [String]])] = [:]
	private(set) var sheets: [String: SystemSheet] = [:]
	/// The controller that presents the page's system sheets.
	weak var presenter: UIViewController?
	private var anchors = Set<ObjectIdentifier>()
	private var assignment: Int
	/// Each styled sheet's layout per resting height, the height it rests at, and each height's current assignment.
	private var sheetStyles: [String: (heights: [(snapPoint: Double, layout: StyleLayout)], height: Int, assignments: [Int])] = [:]
	/// The sheet each node inside a system sheet belongs to.
	private let sheetOf: [String: String]
	/// A tap on the page dismisses the keyboard; a stack makes it wait for its edge-swipe Back.
	let dismissGestures: [UIGestureRecognizer] = [UITapGestureRecognizer()]
	private var stackConstraints: [ObjectIdentifier: [NSLayoutConstraint]] = [:]
	private var forwards: [LabelForward] = []
	/// Each text field's typing limit, kept here because a field holds its delegate weakly.
	private var limits: [LengthLimit] = []
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
	/// Blocks' default margins above and below, in points, before they collapse.
	private var margins: [ObjectIdentifier: CGFloat] = [:]
	/// Space between a box's edges and its children in the stacking layout (a control's padding), by box.
	private var paddings: [ObjectIdentifier: UIEdgeInsets] = [:]
	/// Checkboxes and radio buttons drawn as Chrome draws them unstyled (`control: tick`).
	private var chromeTicks = Set<ObjectIdentifier>()
	/// Textareas drawn as Chrome draws them unstyled (`control: area`), with the width and height their `cols` and `rows` set.
	private var chromeAreas: [ObjectIdentifier: (width: NSLayoutConstraint, height: NSLayoutConstraint)] = [:]
	/// Inline-level boxes (`<a>`, `<button>`, `<input>`, `<img>`) of the stacking layout: they share lines with text.
	private var inlineViews = Set<ObjectIdentifier>()
	/// Whether a paragraph's text starts or ends with whitespace, by its label: a space beside an inline box on its line.
	private var textEdges: [ObjectIdentifier: (before: Bool, after: Bool)] = [:]
	/// The containers whose children share lines, with the width their lines were broken at and the guides of those lines.
	private var lineBoxes: [ObjectIdentifier: (container: UIView, guides: [UILayoutGuide], items: [UIView], widths: [CGFloat])] = [:]
	/// The width the page's content gets (the safe area less the body's margins), from the last layout; 0 before the first.
	private var pageWidth: CGFloat = 0
	/// Lists and the marker kind their items show; each item's marker label.
	private var listMarkers: [ObjectIdentifier: String] = [:]
	private var itemMarkers: [ObjectIdentifier: UILabel] = [:]
	/// Table structure: tables, their rows and the rows' cells.
	private var tables = Set<ObjectIdentifier>()
	private var tableRows = Set<ObjectIdentifier>()
	private var tableCells = Set<ObjectIdentifier>()
	/// Boxes whose content is centred across them (`<th>`).
	private var centered = Set<ObjectIdentifier>()
	private var columnConstraints: [ObjectIdentifier: [NSLayoutConstraint]] = [:]
	private var tableViews: [ObjectIdentifier: UIView] = [:]
	/// Views a container holds that the stacking layout does not place (a list marker, a rule's line).
	private var decorations = Set<ObjectIdentifier>()
	/// The open dialog's top layer and the place in the page its view returns to.
	private var topLayer: (layer: TopLayerView, home: UIView, index: Int)?
	/// The scroll view each scroll container hosts its children in.
	private var scrollViews: [String: ContainerScrollView] = [:]
	/// What a stopped submit says, shown until the person's next action.
	private var message: UILabel?
	private var touches: TouchWatcher?
	/// Each drawn checkbox (false) or radio button (true) and whether it is checked.
	private var ticks: [String: (radio: Bool, checked: Bool)] = [:]
	private(set) var overlays: OverlayHost!

	init(
		runtime: NativeRuntime, layout: StyleLayout?, sheetLayouts: [String: [(snapPoint: Double, layout: StyleLayout)]] = [:],
		faces: [String: UIFontDescriptor], onAction: @escaping (NativeAction) -> Void,
		ask: @escaping (NativeAction) -> Bool = { _ in false },
		objectView: @escaping (_ object: String, _ device: String) throws -> UIView = { object, _ in throw HostError("no device to show \(object)") }
	) throws {
		self.runtime = runtime
		self.objectView = objectView
		self.layout = layout
		self.faces = faces
		self.onAction = onAction
		self.ask = ask
		keyboard = KeyboardDismisser(page)
		assignment = layout?.start ?? 0
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
			gesture.addTarget(keyboard, action: #selector(KeyboardDismisser.dismiss))
			page.addGestureRecognizer(gesture)
		}
		if layout == nil {
			stackTree(root)
			for sheet in sheets.values { stackTree(sheet.content) }
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
			restack: { [unowned self] container in if self.layout == nil { self.restack(container) } })
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

	/// The page's scrollable size: Dragon's page range over the viewport it laid out at.
	private func sizePage() throws {
		guard let layout else { return }
		let viewport = layout.viewport
		let range = layout.pageScrolls[assignment]
		page.contentSize = CGSize(width: viewport.width + (range?.maxX ?? 0), height: viewport.height + (range?.maxY ?? 0))
		root.frame = CGRect(origin: .zero, size: page.contentSize)
		guard range == nil else { return }
		let drawn = root.subviews.reduce(CGRect.null) { $0.union($1.frame) }
		if drawn.maxX > viewport.width + 0.5 || drawn.maxY > viewport.height + 0.5 {
			throw HostError("the page is \(drawn.maxY) points tall on a \(viewport.height) point screen, and Dragon does not decide its scroll range: \(layout.pageScrollUndecided ?? "the style export has no page range")")
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
		do { try overlays.mount(in: screen) } catch { fatalError("Markless iOS host: \(error)") }
		guard layout == nil else { return }
		root.translatesAutoresizingMaskIntoConstraints = false
		let content = page.contentLayoutGuide
		NSLayoutConstraint.activate([
			root.topAnchor.constraint(equalTo: content.topAnchor),
			root.bottomAnchor.constraint(equalTo: content.bottomAnchor),
			// The browser's body margin, 8 px; the stacking layout gives the top and bottom ones (`stack`).
			root.leadingAnchor.constraint(equalTo: screen.safeAreaLayoutGuide.leadingAnchor, constant: ViewTree.bodyMargin),
			root.trailingAnchor.constraint(equalTo: screen.safeAreaLayoutGuide.trailingAnchor, constant: -ViewTree.bodyMargin),
			content.leadingAnchor.constraint(equalTo: page.frameLayoutGuide.leadingAnchor),
			content.widthAnchor.constraint(equalTo: page.frameLayoutGuide.widthAnchor),
		])
	}

	func unmount() {
		dismissMessage()
		if let touches { touches.view?.removeGestureRecognizer(touches) }
		touches = nil
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
	var canvas: UIColor? { layout.map { $0.canvases[assignment].map(uiColor) ?? .white } }

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
				if let button = contexts[node]?.button { refreshLabel(of: button) }
			case .selected:
				// Each select's shown choice is read again once the whole journal is applied.
				continue
			case let .checked(node, checked):
				if elements[node] is AbsentField { continue }
				guard let tick = ticks[node], let view = elements[node] else { throw HostError("journal names checkbox \(node), which is not shown") }
				ticks[node] = (tick.radio, checked)
				drawTick(node, view)
			case let .property(node, _, value):
				if elements[node] is AbsentField { continue }
				if let area = elements[node] as? TextArea {
					area.text = value
					continue
				}
				guard let field = elements[node] as? UITextField else { throw HostError("journal names input \(node), which is not a shown field") }
				field.text = value
			case let .attribute(node, name, value):
				if flowing.contains(node) {
					attributes[node, default: [:]][name] = value
					continue
				}
				guard let view = elements[node] else { throw HostError("journal names element \(node), which is not shown") }
				attributes[node, default: [:]][name] = value
				applyAttributes(node, view)
			case let .sheet(node, open):
				guard let sheet = sheets[node] else { throw HostError("journal names sheet \(node), which is not built") }
				if open { sheet.open(from: presenter) } else { sheet.close() }
			case .navigate, .title:
				throw HostError("navigate and title entries reach the screen's controller, not its views")
			case .call, .release, .fetch, .abort:
				throw HostError("a \(entry.json.jsonText) entry reaches the page's device or script services, not its views")
			case let .dialog(node, open):
				try present(node, open: open)
			case let .command(node, command, preventScroll):
				guard let view = elements[node] else { throw HostError("journal names element \(node), which is not shown") }
				root.layoutIfNeeded()
				// As on the web: scrollIntoView aligns the element to the start; focus brings it into view unless told not to.
				if command == "scrollIntoView" {
					bringIntoView(view, block: scrollIntoViewAlign.block, inline: scrollIntoViewAlign.inline)
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
				}
				for (sheet, styles) in sheetStyles {
					var moved = styles
					for (index, height) in styles.heights.enumerated() where height.layout.stateCells.contains(cell) {
						moved.assignments[index] = try height.layout.next(from: styles.assignments[index], cell: cell, value: value)
					}
					sheetStyles[sheet] = moved
				}
				try repaint { _ in true }
				try sizePage()
			case let .arm(node, index):
				guard let branch = branches[node], let context = contexts[node] else { throw HostError("journal names branch \(node), which is not shown") }
				let container = branch.anchor.superview ?? root
				for id in branch.built { remove(id) }
				var position = (container.subviews.firstIndex(of: branch.anchor) ?? container.subviews.count) + 1
				let built = try index.map { try build("\(templates[node] ?? node)#\($0)", in: container, at: &position, context) } ?? []
				branches[node] = (branch.anchor, index, built)
				settle(container, built: built, context)
			case let .rows(node, keys):
				guard let list = lists[node], let context = contexts[node] else { throw HostError("journal names list \(node), which is not shown") }
				let container = list.anchor.superview ?? root
				var built = list.built
				for key in list.keys where !keys.contains(key) {
					for id in built.removeValue(forKey: key) ?? [] { remove(id) }
				}
				let items = Dictionary(try runtime.rows(of: templates[node] ?? node).map { ($0.key, $0.item) }, uniquingKeysWith: { $1 })
				var position = container.subviews.count
				for key in keys where built[key] == nil {
					guard let item = items[key] else { throw HostError("\(node) has no current row \(key)") }
					built[key] = try buildRow(templates[node] ?? node, key: key, item: item, in: container, at: &position, context)
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
			if node.live != nil { return id + suffix }
			parent = node.parent
		}
		return nil
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
			let base = region.split(separator: "@").first.map(String.init) ?? region
			guard let live = nodes[base]?.live, let view = elements[region] ?? paragraphs[region]?.view else { continue }
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
			if layout == nil { restack(top.home) }
			topLayer = nil
			UIAccessibility.post(notification: .screenChanged, argument: nil)
		}
	}

	/// The text an element shows, in view order: what `aria-labelledby` and `aria-describedby` read from it.
	/// Whether a template has text inside it, at any depth, whatever that text reads now; its labels are filled after it is built.
	private func holdsText(_ template: String) -> Bool {
		(slots[template] ?? []).contains { nodes[$0]?.isText == true || holdsText($0) }
	}

	private func text(within view: UIView) -> String {
		if let label = view as? UILabel { return label.text ?? "" }
		return view.subviews.map { text(within: $0) }.filter { !$0.isEmpty }.joined(separator: " ")
	}

	/// Labels and hints taken from the elements an attribute names by id, kept current after every journal; a `<label for>`
	/// names its control, so VoiceOver reads it there and not a second time on the label.
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
			if current["for"].flatMap({ elements[$0] }) != nil { view.accessibilityElementsHidden = true }
		}
	}

	/// Paints a view and puts it at its frame; inside a scroll container, frames count from the scroll view's padding box.
	private func place(_ id: String, _ view: UIView, _ style: ResolvedStyle) throws {
		try paint(view, style, faces: faces)
		if let host = view.superview as? ContainerScrollView { view.frame.origin = CGPoint(x: view.frame.minX - host.inset.left, y: view.frame.minY - host.inset.top) }
		guard let scroll = scrollViews[id] else {
			if style.scroll != nil { throw HostError("\(id) became a scroll container after it was built") }
			return
		}
		guard let s = style.scroll else { throw HostError("\(id) stopped being a scroll container after it was built") }
		scroll.configure(s, in: view.bounds.size, cornerRadius: style.cornerRadius)
	}

	private func style(of id: String) -> ResolvedStyle? {
		guard let template = templates[id] else { return nil }
		if let sheet = sheetOf[template] {
			guard let styles = sheetStyles[sheet] else { return nil }
			return styles.heights[styles.height].layout.assignments[styles.assignments[styles.height]][template]
		}
		return layout?.assignments[assignment][template]
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
			for id in built.flatMap(withArms) { if let view = elements[id] { stackTree(view) } }
			restack(container)
		}
	}

	/// A branch instance followed by what its shown arm placed, recursively; any other id alone.
	private func withArms(_ id: String) -> [String] {
		[id] + (branches[id]?.built.flatMap(withArms) ?? [])
	}

	private func buildRow(_ list: String, key: String, item: NativeValue, in container: UIView, at index: inout Int, _ context: Context) throws -> [String] {
		var row = context
		row.suffix = "@\(key)"
		row.scope.items[list] = item
		row.scope.keys[list] = key
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
				if unimplementedElements.contains(element) { throw HostError("<\(element)> \(id) has no iOS view yet") }
				let view: UIView
				if let drawing = node.drawing {
					let drawn = DrawingView(drawing)
					drawn.isUserInteractionEnabled = context.button == nil
					if layout == nil {
						leaves.insert(ObjectIdentifier(drawn))
						let ratio = drawing.viewBox.map { $0[3] / $0[2] }
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
				} else if element == "button" || element == "a" {
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
				} else if element == "img" {
					let image = PictureView(frame: .zero)
					image.contentMode = .scaleAspectFit
					image.isAccessibilityElement = true
					image.accessibilityTraits = .image
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
						} catch { fatalError("Markless iOS host: \(error)") }
					}
					if layout == nil, node.defaultStyle?.control == nil {
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
					let control = UIButton(type: .custom)
					control.isAccessibilityElement = true
					control.accessibilityTraits = staticAttributes["type"] == "checkbox" ? [.button, .toggleButton] : .button
					ticks[id] = (staticAttributes["type"] == "radio", try runtime.isChecked(id))
					view = control
				} else if element == "input" {
					if context.button != nil { throw HostError("<input> \(id) is inside a button") }
					let field = TextField()
					let limit = LengthLimit { [weak self] in nativeMaxLength(self?.attributes[id]?["maxlength"]) }
					limits.append(limit)
					field.lengthLimit = limit
					field.addAction(UIAction { [weak self, weak field] _ in
						self?.dismissMessage()
						field?.resignFirstResponder()
					}, for: .editingDidEndOnExit)
					field.addAction(UIAction { [weak self] _ in self?.dismissMessage() }, for: .editingChanged)
					field.addAction(UIAction { [weak self, weak field] _ in
						guard let self, let field else { return }
						self.bringIntoView(field, block: focusIntoViewAlign.block, inline: focusIntoViewAlign.inline)
					}, for: .editingDidBegin)
					if layout == nil, node.defaultStyle?.control == nil {
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
					if layout == nil, node.defaultStyle?.control == nil {
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
				if layout == nil, let style = node.defaultStyle { applyBlockStyle(style, to: view, scale: inner.look.scale) }
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
					try place(id, view, style)
				}
				try wire(events[template] ?? [], on: view, element: element, id: id)
				let boundFor = try bindings.first { $0.name == "for" }.map { try runtime.evaluate($0.value, in: context.scope).text }
				if element == "label", let target = staticAttributes["for"] ?? boundFor {
					// A press on a label activates its control, as a browser does.
					let forward = LabelForward(target: target, onAction: onAction)
					forwards.append(forward)
					view.isUserInteractionEnabled = true
					view.addGestureRecognizer(UITapGestureRecognizer(target: forward, action: #selector(LabelForward.press)))
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
					} ?? staticAttributes["value"]
					if let area = view as? TextArea { area.text = text ?? "" } else { (view as? UITextField)?.text = text }
				}
				var childIndex = 0
				_ = try build(template, in: scrollViews[id] ?? view, at: &childIndex, inner)
				applyAttributes(id, view)
				// The stacking layout sizes a control by its text; one with none (a switch's thumb) gets the 44 pt touch target.
				if layout == nil, view is UIButton, !holdsText(template) {
					view.widthAnchor.constraint(greaterThanOrEqualToConstant: 44).isActive = true
					view.heightAnchor.constraint(greaterThanOrEqualToConstant: 44).isActive = true
				} else if layout == nil, view is UIButton {
					// Its text sizes it, as an unstyled control on the web: the button's own empty-title size must not stretch the label.
					for axis in [NSLayoutConstraint.Axis.horizontal, .vertical] {
						view.setContentCompressionResistancePriority(.init(200), for: axis)
						view.setContentHuggingPriority(.init(200), for: axis)
					}
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
				if !context.suffix.isEmpty { throw HostError("a list inside a list row (\(id)) has no iOS host support yet") }
				let marker = anchor(in: container, at: &index)
				var rows: [String: [String]] = [:]
				var keys: [String] = []
				for row in try runtime.rows(of: template) {
					if rows[row.key] != nil { throw HostError("\(id) has two rows keyed \(row.key)") }
					keys.append(row.key)
					rows[row.key] = try buildRow(template, key: row.key, item: row.item, in: container, at: &index, context)
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
						do { try self?.sheetRested(template, at: snapPoint) } catch { fatalError("Markless iOS host: \(error)") }
					}
				} else if layout != nil {
					throw HostError("system sheet \(id) is on a styled page but has no styles of its own")
				}
				var childIndex = 0
				_ = try build(template, in: sheet.content, at: &childIndex, Context())
				sheets[id] = sheet
				if try runtime.evaluate(open).isTruthy { sheet.open(from: nil) }
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
				control.addAction(UIAction { _ in onAction(NativeAction(event: .activate, host: id, detail: taps.value)) }, for: .touchUpInside)
			case (.activate, _) where !(view is UITextField || view is TextArea):
				// An element that is not a button (a list row): a tap anywhere in it, its text included, presses it.
				view.isUserInteractionEnabled = true
				view.addGestureRecognizer(ActivateGesture { taps in onAction(NativeAction(event: .activate, host: id, detail: taps)) })
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
			case let (.paste, field as TextField):
				field.onPaste = { text in ask(NativeAction(event: .paste, host: id, value: text)) }
			case let (.paste, area as TextArea):
				area.onPaste = { text in ask(NativeAction(event: .paste, host: id, value: text)) }
			case let (.enter, field as UITextField):
				field.addAction(UIAction { _ in onAction(NativeAction(event: .enter, host: id)) }, for: .editingDidEndOnExit)
			case (.idle, _), (.visible, _), (.dismiss, _), (_, _) where event.event.isPointer:
				// Raised elsewhere: idle and visible by the screen's controller, dismiss and pointer events by the overlay host.
				continue
			default:
				throw HostError("\(event.event.rawValue) on <\(element)> \(id) has no iOS control event yet")
			}
		}
	}

	private func remove(_ id: String) {
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
		if let paragraph = paragraphs.removeValue(forKey: id) {
			textEdges.removeValue(forKey: ObjectIdentifier(paragraph.label))
			paragraph.view.removeFromSuperview()
		}
		paragraphTexts.removeValue(forKey: id)
		flowing.remove(id)
		if let view = elements.removeValue(forKey: id) {
			stackConstraints.removeValue(forKey: ObjectIdentifier(view))
			lineBoxes.removeValue(forKey: ObjectIdentifier(view))
			inlineViews.remove(ObjectIdentifier(view))
			view.removeFromSuperview()
		}
		contexts.removeValue(forKey: id)
		templates.removeValue(forKey: id)
		attributes.removeValue(forKey: id)
	}

	/// Static and bound attributes as platform state; `class` reaches views only through the style export.
	private func applyAttributes(_ id: String, _ view: UIView) {
		let current = attributes[id] ?? [:]
		if view is AbsentField { return }
		if let audio = view as? AudioButton {
			audio.isHidden = current["controls"] == nil
			audio.update(source: current["src"], label: current["aria-label"])
		} else if let button = view as? UIButton {
			button.isEnabled = current["disabled"] == nil
			refreshLabel(of: button)
		} else if let drawing = view as? DrawingView {
			// A named svg is an image to VoiceOver; an unnamed one, or one inside a control, is decoration.
			drawing.accessibilityLabel = current["aria-label"]
			drawing.isAccessibilityElement = current["aria-label"] != nil && contexts[id]?.button == nil
			drawing.accessibilityTraits = .image
		} else if let image = view as? PictureView {
			image.accessibilityLabel = current["aria-label"] ?? current["alt"]
			image.image = current["src"].flatMap { URL(string: $0) }.flatMap { $0.isFileURL ? UIImage(contentsOfFile: $0.path) : nil }
			image.alt = current["alt"] ?? ""
		} else {
			view.accessibilityLabel = current["aria-label"]
		}
		if let field = view as? UITextField {
			field.isEnabled = current["disabled"] == nil
			// Shown while the field is empty, in Chrome's placeholder grey (#757575).
			field.attributedPlaceholder = current["placeholder"].map {
				NSAttributedString(string: $0, attributes: [.foregroundColor: UIColor(white: 117 / 255, alpha: 1), .font: field.font ?? UIFont.systemFont(ofSize: TextLook.baseSize)])
			}
		}
		if let area = view as? TextArea {
			area.isEditable = current["disabled"] == nil
			area.placeholder = current["placeholder"]
			if let size = chromeAreas[ObjectIdentifier(area)], let font = area.font {
				// A column is one monospace character and a row one line, as Chrome sizes a textarea; then its 16 pt scrollbar
				// gutter, the 2 pt padding and the 1 pt border.
				let column = ("0" as NSString).size(withAttributes: [.font: font]).width
				size.width.constant = ceil(CGFloat(textareaExtent(current["cols"], 20)) * column) + 16 + 6
				size.height.constant = CGFloat(textareaExtent(current["rows"], 2)) * ceil(font.lineHeight) + 6
			}
		}
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
		view.accessibilityElementsHidden = current["aria-hidden"] == "true"
		// With a style export Dragon decides visibility (a hidden element has no frame); the stacking layout reads `hidden`.
		if layout == nil, !dialogIds.contains(id) {
			// An option shows only in its select's list.
			let hidden = current["hidden"] != nil || view.superview is SelectButton
			if view.isHidden != hidden {
				view.isHidden = hidden
				if let parent = view.superview, !(parent is UIButton || parent is OverlayCard) { restack(parent) }
			}
		}
	}

	private func drawTick(_ id: String, _ view: UIView) {
		guard let tick = ticks[id], let button = view as? UIButton else { return }
		if chromeTicks.contains(ObjectIdentifier(button)) {
			ChromeTick.apply(to: button, radio: tick.radio, checked: tick.checked)
		} else {
			let symbol = tick.radio ? (tick.checked ? "largecircle.fill.circle" : "circle") : (tick.checked ? "checkmark.square.fill" : "square")
			button.setImage(UIImage(systemName: symbol), for: .normal)
		}
		button.accessibilityValue = tick.checked ? "1" : "0"
	}

	/// Each select shows its chosen option's label, as the web's closed `<select>` does.
	private func refreshSelects() {
		for (id, view) in elements {
			guard let select = view as? SelectButton, let template = templates[id] else { continue }
			do {
				select.show(try runtime.choices(of: template).first { $0.selected }?.label ?? "")
			} catch { fatalError("Markless iOS host: \(error)") }
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
		func texts(_ view: UIView) -> [String] {
			view.subviews.flatMap { child -> [String] in
				if let label = child as? UILabel { return [label.text ?? ""] }
				return texts(child)
			}
		}
		button.accessibilityLabel = texts(button).joined()
	}

	private func stackTree(_ view: UIView) {
		guard !(view is UILabel || view is UITextField || view is TextArea || view is AudioButton), !leaves.contains(ObjectIdentifier(view)) else { return }
		// Children first: a line box measures its items, which needs their own layout in place.
		for child in view.subviews where !anchors.contains(ObjectIdentifier(child)) && !decorations.contains(ObjectIdentifier(child)) { stackTree(child) }
		stack(view)
	}

	/// The temporary layout for rungs without Dragon: children top to bottom, start-aligned, their margins collapsing as on the web.
	private func stack(_ container: UIView) {
		NSLayoutConstraint.deactivate(stackConstraints[ObjectIdentifier(container)] ?? [])
		if tableRows.contains(ObjectIdentifier(container)) {
			stackRow(container)
			return
		}
		var constraints: [NSLayoutConstraint] = []
		var above = container.topAnchor
		let pad = paddings[ObjectIdentifier(container)] ?? .zero
		let indent = (indents[ObjectIdentifier(container)] ?? 0) + pad.left
		var inset = pad.top
		var top = container
		while let parent = top.superview { top = parent }
		let collapses = self.collapses(container)
		let body = container === root ? ViewTree.bodyMargin : 0
		// The margin waiting above the next child; while `leading`, the first children's margins leave through the container.
		var pending = body
		var leading = collapses
		let kids = stacked(container)
		if let old = lineBoxes.removeValue(forKey: ObjectIdentifier(container)) {
			for guide in old.guides { container.removeLayoutGuide(guide) }
		}
		var index = 0
		while index < kids.count {
			let end = runEnd(kids, from: index)
			if end > index + 1 || inlineViews.contains(ObjectIdentifier(kids[index])) {
				// A line box has no margins of its own: the margin waiting above it is the whole gap.
				let lines = lineUp(Array(kids[index..<end]), in: container, below: above, gap: (leading ? 0 : pending) + inset, indent: indent)
				constraints += lines.constraints
				if !lines.empty {
					above = lines.bottom
					leading = false
					pending = 0
					inset = 0
				}
				index = end
				continue
			}
			let child = kids[index]
			index += 1
			child.translatesAutoresizingMaskIntoConstraints = false
			let wide = fullWidth.contains(ObjectIdentifier(child))
			var gap: CGFloat = 0
			if through(child) {
				if !leading { pending = max(pending, marginAbove(child), marginBelow(child)) }
			} else {
				if !leading { gap = max(pending, marginAbove(child)) }
				leading = false
				pending = marginBelow(child)
			}
			let center = centered.contains(ObjectIdentifier(container))
			if center, let label = child as? UILabel { label.textAlignment = .center }
			constraints += [
				child.topAnchor.constraint(equalTo: above, constant: gap + inset),
				// Centred across a `<th>`, else at the start.
				center
					? child.leadingAnchor.constraint(greaterThanOrEqualTo: container.leadingAnchor, constant: indent)
					: child.leadingAnchor.constraint(equalTo: container.leadingAnchor, constant: indent),
				wide
					? child.trailingAnchor.constraint(equalTo: container.trailingAnchor, constant: -pad.right)
					: child.trailingAnchor.constraint(lessThanOrEqualTo: container.trailingAnchor, constant: -pad.right),
			]
			if center { constraints.append(child.centerXAnchor.constraint(equalTo: container.centerXAnchor, constant: (indent - pad.right) / 2)) }
			inset = 0
			if wide {
				// As wide as the page allows: a box with no width of its own (a rule, a code block) takes the line.
				let page = child.widthAnchor.constraint(equalTo: top.widthAnchor)
				page.priority = .defaultHigh
				constraints.append(page)
			}
			above = child.bottomAnchor
		}
		constraints.append(container.bottomAnchor.constraint(equalTo: above, constant: (collapses ? 0 : max(pending, body)) + pad.bottom + inset))
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

	/// Chrome's look for a form control without CSS, light or dark: fill, a 1 pt border, 2 pt corners, its padding and width.
	private func controlLook(_ view: UIView, _ control: String, scale: CGFloat) {
		if control == "tick" {
			chromeTicks.insert(ObjectIdentifier(view))
			return
		}
		let button = control == "button"
		func gray(_ value: CGFloat) -> UIColor { UIColor(white: value / 255, alpha: 1) }
		let fill = UIColor { $0.userInterfaceStyle == .dark ? gray(button ? 107 : 59) : gray(button ? 239 : 255) }
		let line = UIColor { $0.userInterfaceStyle == .dark ? gray(button ? 107 : 133) : gray(118) }
		view.backgroundColor = fill
		view.layer.borderWidth = 1
		view.layer.cornerRadius = 2
		view.layer.borderColor = line.resolvedColor(with: view.traitCollection).cgColor
		view.registerForTraitChanges([UITraitUserInterfaceStyle.self]) { (changed: UIView, _: UITraitCollection) in
			changed.layer.borderColor = line.resolvedColor(with: changed.traitCollection).cgColor
		}
		// The border box is 2 pt; the text sits 6 pt (a field's 2 pt) in from the sides and 1 pt from the top and bottom.
		let side: CGFloat = button ? 8 : 4
		paddings[ObjectIdentifier(view)] = UIEdgeInsets(top: control == "select" ? 2 : 3, left: side, bottom: control == "select" ? 2 : 3, right: control == "select" ? side + 13 : side)
		if let select = view as? SelectButton { select.chromeLook(fontSize: TextLook.baseSize * scale, decorations: &decorations) }
		if let area = view as? TextArea {
			// Monospace text at the control size, 2 pt inside the 1 pt border; `applyAttributes` sizes it by `cols` and `rows`.
			area.font = UIFont.monospacedSystemFont(ofSize: TextLook.baseSize * scale, weight: .regular)
			area.textContainerInset = UIEdgeInsets(top: 3, left: 3, bottom: 3, right: 3)
			area.textContainer.lineFragmentPadding = 0
			area.textColor = .label
			let width = area.widthAnchor.constraint(equalToConstant: 0)
			let height = area.heightAnchor.constraint(equalToConstant: 0)
			NSLayoutConstraint.activate([width, height])
			chromeAreas[ObjectIdentifier(area)] = (width, height)
			return
		}
		guard let field = view as? UITextField else { return }
		field.borderStyle = .none
		field.font = UIFont.systemFont(ofSize: TextLook.baseSize * scale)
		for side in [\UITextField.leftView, \UITextField.rightView] {
			field[keyPath: side] = UIView(frame: CGRect(x: 0, y: 0, width: 4, height: 1))
		}
		field.leftViewMode = .always
		field.rightViewMode = .always
		field.widthAnchor.constraint(equalToConstant: 153).isActive = true
		field.heightAnchor.constraint(equalToConstant: ceil(field.font!.lineHeight) + 6).isActive = true
	}

	/// Where the run of line-sharing children that starts at `start` ends: inline-level boxes and the paragraphs beside them.
	private func runEnd(_ kids: [UIView], from start: Int) -> Int {
		var end = start
		while end < kids.count, sharesLines(kids[end]) { end += 1 }
		return kids[start..<end].contains { inlineViews.contains(ObjectIdentifier($0)) } ? end : start + 1
	}

	private func sharesLines(_ view: UIView) -> Bool {
		let id = ObjectIdentifier(view)
		return (inlineViews.contains(id) || view is UILabel) && !fullWidth.contains(id)
	}

	/// The label whose first baseline is `view`'s: itself, or the first text it shows; nil for a box with no text (an image).
	private func baselineLabel(_ view: UIView) -> UIView? {
		if let label = view as? UILabel { return (label.attributedText?.length ?? 0) > 0 ? label : nil }
		if view is UITextField { return view }
		// A textarea scrolls its text, so its baseline is its bottom edge, as an image's (Chrome's inline-block with overflow).
		if view is TextArea { return nil }
		for child in stacked(view) {
			if let found = baselineLabel(child) { return found }
		}
		return nil
	}

	/**
	 * Places `items` in lines as the web's inline formatting context places inline boxes: side by side, a space between two
	 * only where the text there has whitespace, a new line when the next one does not fit the container's width, and each
	 * line's items on one baseline. The lines are broken at the container's current width; `relineIfResized` breaks them again.
	 */
	private func lineUp(
		_ items: [UIView], in container: UIView, below above: NSLayoutYAxisAnchor, gap: CGFloat, indent: CGFloat
	) -> (constraints: [NSLayoutConstraint], bottom: NSLayoutYAxisAnchor, empty: Bool) {
		// A block is as wide as its containing block on the web: the page less each enclosing box's start inset.
		var width = pageWidth
		var at: UIView? = container
		while let box = at, box !== root {
			width -= indents[ObjectIdentifier(box)] ?? 0
			at = box.superview
		}
		let room = pageWidth > 0 ? max(width, 1) : .greatestFiniteMagnitude
		var lines: [[(view: UIView, gap: CGFloat, width: CGFloat)]] = [[]]
		var measured: [(UIView, CGFloat)] = []
		var x: CGFloat = 0
		var spaced = false
		for item in items {
			item.translatesAutoresizingMaskIntoConstraints = false
			let edges = textEdges[ObjectIdentifier(item)] ?? (false, false)
			if let label = item as? UILabel, (label.attributedText?.length ?? 0) == 0 {
				// Whitespace alone between two boxes is a space; an empty paragraph is nothing.
				if edges.before { spaced = true }
				continue
			}
			let font = (baselineLabel(item) as? UILabel)?.font ?? UIFont.systemFont(ofSize: TextLook.baseSize)
			let space = x > 0 && (spaced || edges.before) ? (" " as NSString).size(withAttributes: [.font: font]).width : 0
			let size = min(fittingWidth(item), room)
			measured.append((item, fittingWidth(item)))
			if x > 0, x + space + size > room {
				lines.append([])
				x = 0
			}
			lines[lines.count - 1].append((item, x > 0 ? space : 0, size))
			x += (x > 0 ? space : 0) + size
			spaced = edges.after
		}
		var constraints: [NSLayoutConstraint] = []
		var guides: [UILayoutGuide] = []
		var top = above
		for line in lines where !line.isEmpty {
			let guide = UILayoutGuide()
			container.addLayoutGuide(guide)
			guides.append(guide)
			let hug = guide.heightAnchor.constraint(equalToConstant: 0)
			hug.priority = .defaultLow
			constraints += [
				guide.topAnchor.constraint(equalTo: top, constant: guides.count == 1 ? gap : 0),
				guide.leadingAnchor.constraint(equalTo: container.leadingAnchor),
				guide.trailingAnchor.constraint(equalTo: container.trailingAnchor),
				hug,
			]
			var leadingEdge = container.leadingAnchor
			var spacing = indent
			let anchorLabel = line.lazy.compactMap { self.baselineLabel($0.view) }.first
			for (index, entry) in line.enumerated() {
				let item = entry.view
				let pinTop = item.topAnchor.constraint(equalTo: guide.topAnchor)
				pinTop.priority = .defaultLow
				// No wider than it was measured, as the web sizes an inline box to its content: no box in the line takes its slack.
				let fit = item.widthAnchor.constraint(lessThanOrEqualToConstant: entry.width)
				fit.priority = .init(999)
				constraints.append(fit)
				// The width it was measured at holds, down to the text a button or link holds: nothing in a line wraps early.
				var held: UIView? = item
				while let box = held {
					let keep = box.widthAnchor.constraint(greaterThanOrEqualToConstant: box === item ? entry.width : min(fittingWidth(box), entry.width))
					keep.priority = .init(999)
					constraints.append(keep)
					let inside = box is UILabel ? [] : stacked(box)
					held = inside.count == 1 ? inside[0] : nil
				}
				constraints += [
					item.leadingAnchor.constraint(equalTo: leadingEdge, constant: index == 0 ? spacing : entry.gap),
					item.trailingAnchor.constraint(lessThanOrEqualTo: container.trailingAnchor),
					item.topAnchor.constraint(greaterThanOrEqualTo: guide.topAnchor),
					guide.bottomAnchor.constraint(greaterThanOrEqualTo: item.bottomAnchor),
					pinTop,
				]
				if let anchorLabel {
					// One baseline per line; a box with no text sits on it with its bottom edge, as an image does.
					let own = baselineLabel(item)
					constraints.append(
						own.map { $0.firstBaselineAnchor.constraint(equalTo: anchorLabel.firstBaselineAnchor) }
							?? item.bottomAnchor.constraint(equalTo: anchorLabel.firstBaselineAnchor))
				}
				leadingEdge = item.trailingAnchor
				spacing = 0
			}
			top = guide.bottomAnchor
		}
		lineBoxes[ObjectIdentifier(container)] = (container, guides, measured.map(\.0), measured.map(\.1))
		return (constraints, top, guides.isEmpty)
	}

	/// After a layout pass with the page `width` wide (its safe area): breaks every line box again when that width changed.
	func relineIfResized(_ width: CGFloat) -> Bool {
		let content = width - 2 * ViewTree.bodyMargin
		let resized = abs(content - pageWidth) > 0.5
		pageWidth = content
		// A box whose items measure differently now (a title set, an image loaded) breaks its lines again too.
		let moved = lineBoxes.values.filter { box in
			resized || zip(box.items, box.widths).contains { abs(fittingWidth($0.0) - $0.1) > 0.5 }
		}
		for box in moved { restack(box.container) }
		return !moved.isEmpty
	}

	/// How wide `view` is on one line, as the web sizes an inline box to its content: text unwrapped, anything else at its fit.
	private func fittingWidth(_ view: UIView) -> CGFloat {
		if let label = view as? UILabel { return ceil(label.attributedText?.size().width ?? 0) }
		// An unstyled button or link is its text and nothing around it.
		let inside = stacked(view)
		let pad = paddings[ObjectIdentifier(view)] ?? .zero
		if inside.count == 1, !(view is UITextField || view is TextArea) { return fittingWidth(inside[0]) + pad.left + pad.right }
		return ceil(view.systemLayoutSizeFitting(UIView.layoutFittingCompressedSize).width)
	}

	/// Stacks `container` again, and each stacked container above it that its first or last child's margins reach.
	private func restack(_ container: UIView) {
		stack(container)
		var at = container
		while collapses(at), let parent = at.superview, stackConstraints[ObjectIdentifier(parent)] != nil {
			stack(parent)
			at = parent
		}
	}

	/// Whether a first and last child's margins pass through the box, as through a web block with no border or padding.
	private func collapses(_ view: UIView) -> Bool {
		let id = ObjectIdentifier(view)
		return type(of: view) == UIView.self && view !== root && !leaves.contains(id) && !tables.contains(id)
			&& !tableRows.contains(id) && !tableCells.contains(id)
	}

	/// An empty paragraph, or a box with nothing shown in it: it has no height and margins collapse through it.
	private func through(_ view: UIView) -> Bool {
		if let label = view as? UILabel { return (label.attributedText?.length ?? 0) == 0 }
		return collapses(view) && stacked(view).allSatisfy(through)
	}

	private func marginAbove(_ view: UIView) -> CGFloat {
		var margin = margins[ObjectIdentifier(view)] ?? 0
		guard collapses(view) else { return margin }
		for child in stacked(view) {
			margin = max(margin, marginAbove(child))
			if !through(child) { break }
			margin = max(margin, marginBelow(child))
		}
		return margin
	}

	private func marginBelow(_ view: UIView) -> CGFloat {
		var margin = margins[ObjectIdentifier(view)] ?? 0
		guard collapses(view) else { return margin }
		for child in stacked(view).reversed() {
			margin = max(margin, marginBelow(child))
			if !through(child) { break }
			margin = max(margin, marginAbove(child))
		}
		return margin
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
		// Cells 2 pt apart and in from the row's ends (`border-spacing: 2px`), each centred on the row's height
		// (`vertical-align: middle`); the row is as tall as its tallest cell.
		for cell in cells {
			cell.translatesAutoresizingMaskIntoConstraints = false
			let fit = row.heightAnchor.constraint(equalTo: cell.heightAnchor)
			fit.priority = .defaultLow
			let narrow = cell.widthAnchor.constraint(equalToConstant: 0)
			narrow.priority = .defaultLow
			constraints += [
				cell.topAnchor.constraint(greaterThanOrEqualTo: row.topAnchor),
				cell.centerYAnchor.constraint(equalTo: row.centerYAnchor),
				cell.leadingAnchor.constraint(equalTo: leading, constant: 2),
				row.bottomAnchor.constraint(greaterThanOrEqualTo: cell.bottomAnchor),
				fit,
				narrow,
			]
			leading = cell.trailingAnchor
		}
		if cells.isEmpty { constraints.append(row.topAnchor.constraint(equalTo: row.bottomAnchor)) }
		else { constraints.append(leading.constraint(lessThanOrEqualTo: row.trailingAnchor, constant: -2)) }
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
	private func applyBlockStyle(_ style: NativeDefaultStyle, to view: UIView, scale: CGFloat) {
		let id = ObjectIdentifier(view)
		if let indent = style.indent { indents[id] = CGFloat(indent) }
		if let margin = style.margin { margins[id] = CGFloat(margin) * TextLook.baseSize * scale }
		if style.inline { inlineViews.insert(id) }
		if let control = style.control { controlLook(view, control, scale: scale) }
		if style.rule {
			// Chrome's hr: a 2 pt inset box, a #9a9a9a line over a #eeeeee one; its 0.5em margins collapse like any block's.
			leaves.insert(id)
			fullWidth.insert(id)
			view.isAccessibilityElement = false
			view.heightAnchor.constraint(equalToConstant: 2).isActive = true
			for (shade, top) in [(CGFloat(154), true), (CGFloat(238), false)] {
				let line = UIView()
				line.backgroundColor = UIColor(white: shade / 255, alpha: 1)
				line.translatesAutoresizingMaskIntoConstraints = false
				view.addSubview(line)
				decorations.insert(ObjectIdentifier(line))
				NSLayoutConstraint.activate([
					line.leadingAnchor.constraint(equalTo: view.leadingAnchor),
					line.trailingAnchor.constraint(equalTo: view.trailingAnchor),
					top ? line.topAnchor.constraint(equalTo: view.topAnchor) : line.bottomAnchor.constraint(equalTo: view.bottomAnchor),
					line.heightAnchor.constraint(equalToConstant: 1),
				])
			}
		}
		if let marker = style.marker { listMarkers[id] = marker }
		switch style.table {
		case "table":
			tables.insert(id)
			tableViews[id] = view
		case "row":
			// Chrome's `border-spacing: 2px`: rows 2 pt apart and from the table's edges, their margins meeting between them.
			tableRows.insert(id)
			margins[id] = 2
		case "cell":
			// A cell's content sits 1 pt inside it.
			tableCells.insert(id)
			paddings[id] = UIEdgeInsets(top: 1, left: 1, bottom: 1, right: 1)
		default: break
		}
		if style.center { centered.insert(id) }
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
		var leadingSpace = false
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
					if pending != nil, out.length == 0, run.isEmpty { leadingSpace = true }
					if let space = pending, !atLineStart { emit(" ", space) }
					pending = nil
					atLineStart = false
					emit(String(character), look)
				}
			}
		}
		flush()
		let wasEmpty = (paragraph.label.attributedText?.length ?? 0) == 0
		paragraph.label.attributedText = out
		// Whitespace at either end is the space the web shows there when an inline box sits beside the text.
		let edges = (before: leadingSpace || (out.length == 0 && pending != nil), after: pending != nil)
		let oldEdges = textEdges.updateValue(edges, forKey: ObjectIdentifier(paragraph.label))
		let edgesMoved = oldEdges.map { $0.before != edges.before || $0.after != edges.after } ?? false
		if layout == nil, wasEmpty != (out.length == 0) || edgesMoved, let container = paragraph.label.superview, stackConstraints[ObjectIdentifier(container)] != nil {
			restack(container)
		}
		// UIKit's own label for a UILabel reads its line breaks as spaces; the text a person reads keeps them.
		paragraph.label.accessibilityLabel = out.string
	}
}

/// `<audio controls>`: a button reading "Play", or "Pause" while its file plays.
@MainActor
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

	/// Chrome's unstyled select inside the field-like box: its text at the control size and a chevron at its end.
	func chromeLook(fontSize: CGFloat, decorations: inout Set<ObjectIdentifier>) {
		display.font = UIFont.systemFont(ofSize: fontSize)
		let chevron = UIImageView(image: ChromeTick.chevron())
		chevron.tintColor = .label
		chevron.translatesAutoresizingMaskIntoConstraints = false
		addSubview(chevron)
		decorations.insert(ObjectIdentifier(chevron))
		NSLayoutConstraint.activate([
			chevron.trailingAnchor.constraint(equalTo: trailingAnchor, constant: -5),
			chevron.centerYAnchor.constraint(equalTo: centerYAnchor),
		])
	}
}

/// Checkboxes and radio buttons as Chrome draws them without CSS: 13 pt, with Chrome's margins inside the button, unchecked in
/// a field's colours and checked in its accent (#0075ff, #99c8ff dark), drawn for light and dark.
@MainActor
enum ChromeTick {
	static func apply(to button: UIButton, radio: Bool, checked: Bool) {
		let margins = radio ? UIEdgeInsets(top: 3, left: 5, bottom: 0, right: 3) : UIEdgeInsets(top: 3, left: 4, bottom: 3, right: 3)
		if button.constraints.first(where: { $0.identifier == "chrome-tick" }) == nil {
			let width = button.widthAnchor.constraint(equalToConstant: 13 + margins.left + margins.right)
			let height = button.heightAnchor.constraint(equalToConstant: 13 + margins.top + margins.bottom)
			width.identifier = "chrome-tick"
			NSLayoutConstraint.activate([width, height])
		}
		let asset = UIImageAsset()
		for style in [UIUserInterfaceStyle.light, .dark] {
			let traits = UITraitCollection(userInterfaceStyle: style)
			asset.register(image(radio: radio, checked: checked, margins: margins, dark: style == .dark), with: traits)
		}
		button.setImage(asset.image(with: button.traitCollection), for: .normal)
		button.contentHorizontalAlignment = .fill
		button.contentVerticalAlignment = .fill
	}

	private static func image(radio: Bool, checked: Bool, margins: UIEdgeInsets, dark: Bool) -> UIImage {
		func gray(_ value: CGFloat) -> UIColor { UIColor(white: value / 255, alpha: 1) }
		let fill = dark ? gray(59) : .white
		let line = dark ? gray(133) : gray(118)
		let accent = dark ? UIColor(red: 153 / 255, green: 200 / 255, blue: 1, alpha: 1) : UIColor(red: 0, green: 117 / 255, blue: 1, alpha: 1)
		let size = CGSize(width: 13 + margins.left + margins.right, height: 13 + margins.top + margins.bottom)
		return UIGraphicsImageRenderer(size: size).image { _ in
			let box = CGRect(x: margins.left, y: margins.top, width: 13, height: 13)
			if radio {
				(checked ? accent : fill).setFill()
				UIBezierPath(ovalIn: box).fill()
				if checked {
					fill.setFill()
					UIBezierPath(ovalIn: box.insetBy(dx: 1.5, dy: 1.5)).fill()
					accent.setFill()
					UIBezierPath(ovalIn: box.insetBy(dx: 3, dy: 3)).fill()
				} else {
					line.setStroke()
					let ring = UIBezierPath(ovalIn: box.insetBy(dx: 0.5, dy: 0.5))
					ring.lineWidth = 1
					ring.stroke()
				}
				return
			}
			(checked ? accent : fill).setFill()
			UIBezierPath(roundedRect: box, cornerRadius: 2).fill()
			if !checked {
				line.setStroke()
				let edge = UIBezierPath(roundedRect: box.insetBy(dx: 0.5, dy: 0.5), cornerRadius: 2)
				edge.lineWidth = 1
				edge.stroke()
				return
			}
			fill.setStroke()
			let tick = UIBezierPath()
			tick.move(to: CGPoint(x: box.minX + 3.5, y: box.minY + 6.8))
			tick.addLine(to: CGPoint(x: box.minX + 5.6, y: box.minY + 9))
			tick.addLine(to: CGPoint(x: box.minX + 9.8, y: box.minY + 4.2))
			tick.lineWidth = 1.6
			tick.lineCapStyle = .round
			tick.lineJoinStyle = .round
			tick.stroke()
		}
	}

	/// The chevron at the end of a closed select: a 7 by 4 pt open V, drawn as a template in the text's colour.
	static func chevron() -> UIImage {
		UIGraphicsImageRenderer(size: CGSize(width: 9, height: 6)).image { _ in
			UIColor.black.setStroke()
			let path = UIBezierPath()
			path.move(to: CGPoint(x: 1, y: 1))
			path.addLine(to: CGPoint(x: 4.5, y: 5))
			path.addLine(to: CGPoint(x: 8, y: 1))
			path.lineWidth = 1.5
			path.lineCapStyle = .round
			path.stroke()
		}.withRenderingMode(.alwaysTemplate)
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
	private let onAction: (NativeAction) -> Void
	init(target: String, onAction: @escaping (NativeAction) -> Void) {
		self.target = target
		self.onAction = onAction
	}
	@objc func press() { onAction(NativeAction(event: .activate, host: target)) }
}

/// A tap or drag outside a field puts the keyboard away, as a scrolling screen does.
@MainActor
final class KeyboardDismisser: NSObject {
	private weak var root: UIView?
	init(_ root: UIView) { self.root = root }
	@objc func dismiss() { root?.endEditing(true) }
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
	paintSides(view, style.sides)
	if let drawing = view as? DrawingView {
		// An svg's text colour is what its currentColor paints.
		if let color = style.textColor { drawing.currentColor = uiColor(color) }
		return
	}
	guard let label = view as? UILabel else {
		if style.font != nil || style.textColor != nil { throw HostError("\(view.accessibilityIdentifier ?? "a box") has text styles but is not text") }
		return
	}
	if let font = style.font {
		guard let face = faces[font.family] else { throw HostError("font \(font.family) was not registered") }
		label.font = UIFont(descriptor: face, size: font.size)
	}
	if let color = style.textColor { label.textColor = uiColor(color) }
}

private func uiColor(_ color: RGBA) -> UIColor {
	UIColor(red: color.r / 255, green: color.g / 255, blue: color.b / 255, alpha: color.alpha / 255)
}
/// One sublayer per side, for borders whose sides differ; Chrome's diagonal corner joins are not drawn.
@MainActor
private func paintSides(_ view: UIView, _ sides: [ResolvedStyle.Side]?) {
	let name = "markless-border-side"
	view.layer.sublayers?.filter { $0.name == name }.forEach { $0.removeFromSuperlayer() }
	guard let sides else { return }
	let b = view.bounds
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
/// which leaves out what the key or paste would do.
@MainActor protocol KeyedInput: AnyObject {
	var onKey: ((String) -> Bool)? { get }
	var onPaste: ((String) -> Bool)? { get }
}

extension KeyedInput {
	func keyLeavesOut(_ text: String) -> Bool { onKey?(text == "\n" ? "Enter" : text) ?? false }
	func pasteLeavesOut() -> Bool { onPaste?(UIPasteboard.general.string ?? "") ?? false }
}

/// An `<input>`'s field, whose `keydown` and `paste` handlers run before the key or paste edits it. Return reaches it as
/// `textFieldShouldReturn`, not as typed text; a prevented Return neither returns nor puts the keyboard away.
final class TextField: UITextField, KeyedInput, UITextFieldDelegate {
	var onKey: ((String) -> Bool)?
	var onPaste: ((String) -> Bool)?
	/// `maxlength`: the field stays its own delegate, so its Return key keeps reaching the keydown handler.
	var lengthLimit: LengthLimit?

	override init(frame: CGRect) {
		super.init(frame: frame)
		delegate = self
	}

	func textField(_ field: UITextField, shouldChangeCharactersIn range: NSRange, replacementString string: String) -> Bool {
		lengthLimit?.textField(field, shouldChangeCharactersIn: range, replacementString: string) ?? true
	}

	@available(*, unavailable)
	required init?(coder: NSCoder) { fatalError("init(coder:) is not used") }

	override func insertText(_ text: String) {
		if text != "\n" && keyLeavesOut(text) { return }
		super.insertText(text)
	}

	func textFieldShouldReturn(_ textField: UITextField) -> Bool { !keyLeavesOut("\n") }

	override func deleteBackward() {
		if onKey?("Backspace") == true { return }
		super.deleteBackward()
	}

	override func paste(_ sender: Any?) {
		if pasteLeavesOut() { return }
		super.paste(sender)
	}
}

/// A textarea's `cols` or `rows` as HTML reads it: the digits after any leading whitespace, if they make a number above zero,
/// else `fallback`.
func textareaExtent(_ value: String?, _ fallback: Int) -> Int {
	let digits = (value ?? "").drop { $0 == " " || $0 == "\t" || $0 == "\n" || $0 == "\r" || $0 == "\u{0C}" }.prefix { $0.isASCII && $0.isNumber }
	return Int(digits).flatMap { $0 > 0 ? $0 : nil } ?? fallback
}

/// A `<textarea>`: a text view that reports each edit as a text field's `editingChanged` does; Return adds a line.
final class TextArea: UITextView, UITextViewDelegate, KeyedInput {
	var onChange: [(String) -> Void] = []
	var onKey: ((String) -> Bool)?
	var onPaste: ((String) -> Bool)?
	var onBegin: (() -> Void)?
	var onFocus: [() -> Void] = []
	var onBlur: [() -> Void] = []
	/// The `placeholder` attribute's text, shown while the textarea is empty in Chrome's placeholder grey (#757575).
	private let placeholderLabel = UILabel()
	var placeholder: String? {
		get { placeholderLabel.text }
		set {
			placeholderLabel.text = newValue
			showPlaceholder()
		}
	}
	override var text: String! { didSet { showPlaceholder() } }
	override var font: UIFont? { didSet { placeholderLabel.font = font } }

	init() {
		super.init(frame: .zero, textContainer: nil)
		delegate = self
		isScrollEnabled = true
		placeholderLabel.textColor = UIColor(white: 117 / 255, alpha: 1)
		placeholderLabel.numberOfLines = 0
		placeholderLabel.isAccessibilityElement = false
		placeholderLabel.isHidden = true
		addSubview(placeholderLabel)
	}

	private func showPlaceholder() { placeholderLabel.isHidden = (placeholderLabel.text ?? "").isEmpty || !(text ?? "").isEmpty }

	override func layoutSubviews() {
		super.layoutSubviews()
		// Where the first line of text starts, wrapped to the text's width.
		let inset = textContainerInset
		let width = bounds.width - inset.left - inset.right - 2 * textContainer.lineFragmentPadding
		let height = placeholderLabel.sizeThatFits(CGSize(width: width, height: .greatestFiniteMagnitude)).height
		placeholderLabel.frame = CGRect(x: inset.left + textContainer.lineFragmentPadding, y: inset.top, width: max(0, width), height: height)
	}

	@available(*, unavailable)
	required init?(coder: NSCoder) { fatalError("init(coder:) is not used") }

	override func insertText(_ text: String) {
		if keyLeavesOut(text) { return }
		super.insertText(text)
	}

	override func deleteBackward() {
		if onKey?("Backspace") == true { return }
		super.deleteBackward()
	}

	override func paste(_ sender: Any?) {
		if pasteLeavesOut() { return }
		super.paste(sender)
	}

	func textViewDidChange(_ textView: UITextView) {
		showPlaceholder()
		for change in onChange { change(text) }
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

/// An `img`: its picture in a 120 by 90 box. Without a picture it shows its alt text in the picture's place, as the web
/// does, and takes no space when that is empty.
final class PictureView: UIImageView {
	private let altLabel = UILabel()

	var alt = "" {
		didSet { update() }
	}

	override var image: UIImage? {
		didSet { update() }
	}

	override init(frame: CGRect) {
		super.init(frame: frame)
		altLabel.numberOfLines = 0
		altLabel.isAccessibilityElement = false
		altLabel.translatesAutoresizingMaskIntoConstraints = false
		addSubview(altLabel)
		NSLayoutConstraint.activate([
			altLabel.topAnchor.constraint(equalTo: topAnchor),
			altLabel.leadingAnchor.constraint(equalTo: leadingAnchor),
			altLabel.trailingAnchor.constraint(lessThanOrEqualTo: trailingAnchor),
		])
		update()
	}

	@available(*, unavailable)
	required init?(coder: NSCoder) { fatalError("init(coder:) is not supported") }

	override var intrinsicContentSize: CGSize {
		if image != nil { return CGSize(width: 120, height: 90) }
		return altLabel.isHidden ? .zero : altLabel.intrinsicContentSize
	}

	private func update() {
		altLabel.text = alt
		altLabel.isHidden = image != nil || alt.isEmpty
		invalidateIntrinsicContentSize()
	}
}
