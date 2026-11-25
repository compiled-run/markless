import Foundation

public let dragonStyleExportSchemas = ["dragon.native-style-export/0", "dragon.native-style-export/1"]
private let dragonStyleExportUnits = [
	"device px; frames relative to the parent box",
	"frames and borderWidths in device px, frames relative to the parent box; lengths inside writes in CSS px",
]

public struct RGBA: Equatable, Sendable {
	public let r: Double, g: Double, b: Double, alpha: Double
}

public struct Frame: Equatable, Sendable {
	public let x: Double, y: Double, width: Double, height: Double

	public init(x: Double, y: Double, width: Double, height: Double) {
		self.x = x
		self.y = y
		self.width = width
		self.height = height
	}
}

/// Frames and border widths are device pixels; the lengths inside writes (font size, radius) are CSS pixels.
public enum StyleWrite: Sendable {
	case backgroundColor(RGBA)
	case borderWidths
	case borderStyles([String])
	case borderColors([RGBA])
	case borderRadius([(percent: Bool, value: Double)])
	case font(family: String, size: Double)
	case textColor(RGBA)
	case syntheticBold
	/// `overflow-x` / `overflow-y` `auto` or `scroll`: the box hosts its children in a scroll view over its padding box.
	case scrollContainer(x: Bool, y: Bool)
	/// `scrollbar-width: none`.
	case scrollIndicatorsHidden
	/// Children clipped to the padding box (`overflow` other than visible); a scroll container's scroll view is that clip.
	case paddingBoxClip
	/// `overscroll-behavior: none` on an axis.
	case scrollBounce(x: Bool, y: Bool)
	/// clip-path: inset(): the box and everything in it are clipped to its border box inset by each edge (top, right, bottom, left).
	case clipPathInset([(value: Double, percent: Bool)])
	/// The text a clip-path leaves exposed to the screen reader; a clip does not change accessibility, so nothing to apply.
	case clipText
	/// The box paints in another stacking context's order (Dragon's re-hosting); `host` is that context's node.
	case paintOrder(host: String, bucket: Int, rank: Int)
	/// box-shadow: the computed shadows in list order.
	case boxShadow([BoxShadow.Shadow])
	/// `visibility`: visible, hidden or collapse; a box not visible keeps its space and its children, and paints none of its own.
	case visibility(String)
	/// An `<img>` whose src the app sets as it runs: the host draws whatever image loads into its content box, as Chrome does.
	case runtimeImage(RuntimeImage)
	/// A select whose appearance devolves to menulist-button: its drop-down arrow is stroked in this colour, along the path
	/// Dragon's plan layout gives (`StyleNode.selectArrow`).
	case selectArrow(RGBA)
	/// A themed checkbox (`appearance: auto`): drawn in these colours over the marks Dragon's plan layout gives
	/// (`StyleNode.checkboxMarks`), checked or not as the input's live checkedness says.
	case checkbox(CheckboxColors)
	/// `outline`: drawn after its stacking context's flow content, in the view of its paint layer (`Outline.layer`).
	case outline(Outline)
	/// `transform`: the functions and origin as Dragon wrote them, lengths in CSS px; Dragon's translated paint math resolves them at the box size.
	case transform(StyleTransform)
	/// `opacity` below 1 that Dragon pre-composites: the box keeps alpha 1 and shows the group composited over what paints before it.
	case opacityGroup(OpacityGroup)
	/// `opacity` below 1 that the platform composites: the view's alpha is Chrome's alpha byte / 255, its subtree drawn as one group.
	case opacity(Double)
}

/// A transform length: CSS px (`px`), a percentage of the border box (`percent`), or both (`calc`).
public struct TransformLength: Equatable, Sendable {
	public let kind: String
	public let px: Double
	public let percent: Double
}

/// One transform function: `fn` is translate, translateX, translateY, rotate, scale, scaleX or scaleY; `angle` in degrees.
public struct TransformFunction: Equatable, Sendable {
	public let fn: String
	public let x: TransformLength
	public let y: TransformLength
	public let angle: Double
	public let sx: Double
	public let sy: Double
}

public struct StyleTransform: Equatable, Sendable {
	public let functions: [TransformFunction]
	public let originX: TransformLength
	public let originY: TransformLength
}

/// A pre-composited opacity group: its opacity, the box whose background holds it (nil: the canvas), the earlier groups its
/// backdrop shows (Dragon ids), the sticky box it paints after, when there is one, and the earlier paint whose platform capture
/// may differ from the screen (`unstable`).
public struct OpacityGroup: Equatable, Sendable {
	public let opacity: Double
	public let backdrop: String?
	public let painters: [String]
	public let after: String?
	public var unstable: [String] = []
}

/// An outline as Dragon lowers it: its style, width and offset in CSS px, its colour, a 3D style's lighter and darker colours,
/// the box's corner radius lengths (nil: square), and the node whose paint layer paints it.
public struct Outline: Equatable, Sendable {
	public static let styles = ["solid", "double", "dotted", "dashed", "groove", "ridge", "inset", "outset"]
	public let style: String
	public let width: Double
	public let offset: Double
	public let color: RGBA
	public let tones: (light: RGBA, dark: RGBA)?
	public let radii: [(percent: Bool, value: Double)]?
	public let layer: String

	public static func == (a: Outline, b: Outline) -> Bool {
		a.style == b.style && a.width == b.width && a.offset == b.offset && a.color == b.color && a.layer == b.layer
			&& a.tones?.light == b.tones?.light && a.tones?.dark == b.tones?.dark
			&& a.radii?.map(\.percent) == b.radii?.map(\.percent) && a.radii?.map(\.value) == b.radii?.map(\.value)
	}
}

/// Dragon's layout unit, which the runtime-image write's content box counts in: 1/64 px, as Blink's LayoutUnit.
public let dragonLayoutUnitsPerPx = 64.0

/// An `<img>` whose src the app sets as it runs: its object-fit and object-position, whether image-rendering is pixelated, the
/// no-image outline's colour when its src can be absent (nil: it always has one), and its content box at the export's layout,
/// absolute, in Dragon's layout units.
public struct RuntimeImage: Equatable, Sendable {
	/// One axis of object-position: CSS px, or a percent of the room the image leaves.
	public struct Position: Equatable, Sendable {
		public let percent: Bool
		public let value: Double
	}
	public let fit: String
	public let position: [Position]
	public let pixelated: Bool
	public let outline: RGBA?
	public let content: Frame?
}

/// Where a runtime image is painted from, in absolute device px: its content box, and the origin of its node's frame.
public struct RuntimeImagePlace: Equatable, Sendable {
	public let content: Frame
	public let originX: Double
	public let originY: Double
}

/// A themed checkbox's colours, as Chrome's theme gives them for its accent-color.
public struct CheckboxColors: Equatable, Sendable {
	public let uncheckedBackground: RGBA
	public let uncheckedBorder: RGBA
	public let checkedBackground: RGBA
	public let fill: RGBA
	public let check: RGBA
}

/// A themed checkbox's marks as Dragon's plan layout gives them, in device px from the snapped border box, which sits at
/// `origin` relative to the node's frame: the square (`x`, `y`, `side`), drawn as one fill when `plain`; otherwise its background
/// inset by `backgroundInset` and, unchecked, its border stroked `borderWidth` wide inset by `borderInset`, both rounded by
/// `radius`; checked, the square filled and the open path `check` (three x, y pairs) stroked `checkWidth` wide.
public struct CheckboxMarks: Equatable, Sendable {
	public let originX: Double
	public let originY: Double
	public let x: Double
	public let y: Double
	public let side: Double
	public let plain: Bool
	public let radius: Double
	public let backgroundInset: Double
	public let borderInset: Double
	public let borderWidth: Double
	public let check: [Double]
	public let checkWidth: Double
}

/// A select's drop-down arrow as Dragon's plan layout gives it: an open path of `points` (x, y pairs, the first moved to),
/// stroked `strokeWidth` wide with butt caps and miter joins (limit 4), all in device px from the snapped border box, which
/// sits at `origin` relative to the node's frame.
public struct SelectArrow: Equatable, Sendable {
	public let originX: Double
	public let originY: Double
	public let strokeWidth: Double
	public let points: [Double]
}

/// A dashed or dotted border as Dragon's own native paint draws it (its port of Blink's side painter): operations in device px,
/// with the box's snapped border box at `origin` (relative to the node's frame); `side` names the side whose colour an operation takes.
public struct BorderOps: Equatable, Sendable {
	public struct Op: Equatable, Sendable {
		public let op: String
		public let side: Int
		public let alpha: Double
		public let antialias: Bool
		public let points: [Double]

		public init(op: String, side: Int, alpha: Double, antialias: Bool, points: [Double]) {
			self.op = op
			self.side = side
			self.alpha = alpha
			self.antialias = antialias
			self.points = points
		}
	}
	public let originX: Double
	public let originY: Double
	public let ops: [Op]
}

/// A system face of the export (`system:<role>:<weight>`): the platform's own font, rebuilt as Dragon measured it at build time.
public enum SystemFace: Sendable, Equatable {
	/// `UIFont.systemFont(ofSize:weight:)` at this `UIFont.Weight` value, in the system design named `design` (`default`, `serif`, `monospaced`).
	case system(weight: Double, design: String)
	/// `CTFontCreateWithName` by PostScript name.
	case named(postScriptName: String)
}

/// Consecutive glyphs of a text line in one face at one size (device px); each x is a pen origin in device px from the node's frame.
public struct GlyphRun: Sendable, Equatable {
	public let face: String
	public let size: Double
	public let glyphs: [UInt16]
	public let xs: [Double]
}

/// One line of a text node as Dragon laid it out: its line box top and baseline in device px from the node's frame, and its runs.
public struct TextLine: Sendable, Equatable {
	public let top: Double
	public let baseline: Double
	public let runs: [GlyphRun]
}

private let transformFunctions = ["translate", "translateX", "translateY", "rotate", "scale", "scaleX", "scaleY"]

public struct StyleNode: Sendable {
	public let id: String
	public let parent: String?
	public let isText: Bool
	public let isAnonymous: Bool
	public let text: String?
	public let frame: Frame?
	public let borderWidths: (top: Double, right: Double, bottom: Double, left: Double)?
	public let writes: [StyleWrite]
	public let borderOps: BorderOps?
	/// Only on a scroll container: its offset range in device px.
	public let scrollRange: ScrollOffsetRange?
	/// Only on a framed text node: its lines as Dragon laid them out, glyph for glyph.
	public let lines: [TextLine]?
	/// Only on a framed node with a runtime-image write, once its place is known.
	public var runtimeImagePlace: RuntimeImagePlace? = nil

	public var runtimeImage: RuntimeImage? {
		for case let .runtimeImage(image) in writes { return image }
		return nil
	}
	/// Only on a select with a `selectArrow` write, once Dragon's plan has laid the page out.
	public var selectArrow: SelectArrow? = nil
	/// Only on a checkbox with a `checkbox` write, once Dragon's plan has laid the page out.
	public var checkboxMarks: CheckboxMarks? = nil
	/// Only on a textarea, once Dragon's plan has laid the page out: the lines its host view lays typed text out by.
	public var textAreaLines: TextAreaLines? = nil

	var drawsSelectArrow: Bool { writes.contains { if case .selectArrow = $0 { return true } else { return false } } }
	var drawsCheckbox: Bool { writes.contains { if case .checkbox = $0 { return true } else { return false } } }

	/// The node with no box: a list's template, which only its rows' copies show.
	func hidden() -> StyleNode {
		StyleNode(
			id: id, parent: parent, isText: isText, isAnonymous: isAnonymous, text: text, frame: nil, borderWidths: nil, writes: writes,
			borderOps: nil, scrollRange: nil, lines: nil)
	}
}

/// A style state of Dragon's export: the cell it follows (by key) and the values it can take.
public struct StyleState: Sendable {
	public let key: String
	public let domain: [NativeValue]

	/// The key names a payload cell when it is the cell's id or ends in `#<cell id>`.
	public func names(_ cell: String) -> Bool { key == cell || key.hasSuffix("#\(cell)") }
}

public let nativeAppStyleVersion = "markless.native-app-style/0"
public let dragonMarklessPlanVersion = "dragon.markless-plan/1"

/// A number of Dragon's plan layout: its IEEE 754 bit pattern as 16 hex digits; arrays of them element by element.
private func planNumbers(_ value: JSONValue) throws -> JSONValue {
	switch value {
	case .array(let items): return .array(try items.map(planNumbers))
	default: return .number(try planNumber(value))
	}
}

extension String {
	fileprivate func leftPadded(_ count: Int) -> String { String(repeating: "0", count: max(0, count - self.count)) + self }
}

func planNumber(_ value: JSONValue) throws -> Double {
	guard case let .string(hex) = value, hex.utf8.count == 16, let bits = UInt64(hex, radix: 16) else {
		throw PayloadError(path: "plan layout", reason: "\(value.jsonText) is not a number's bit pattern")
	}
	return Double(bitPattern: bits)
}

/// Dragon's border operations of a box, as [[origin x, y], [width, height], widths, [[op, side, alpha, antialias, points]]], in the export's shape.
private func planBorderOps(_ reader: Reader) throws -> JSONValue {
	let p = try reader.array()
	guard p.count == 4 else { throw reader.fail("expected origin, size, widths and operations") }
	let origin = try p[0].array().map { try planNumber($0.value) }
	let size = try p[1].array().map { try planNumber($0.value) }
	guard origin.count == 2, size.count == 2 else { throw reader.fail("expected an origin and a size") }
	return .object([
		("origin", .object([("x", .number(origin[0])), ("y", .number(origin[1]))])),
		("size", .object([("width", .number(size[0])), ("height", .number(size[1]))])),
		("widths", try planNumbers(p[2].value)),
		("ops", .array(try p[3].array().map { op in
			let o = try op.array()
			guard o.count == 5 else { throw op.fail("expected op, side, alpha, antialias and points") }
			return .object([("op", o[0].value), ("side", o[1].value), ("alpha", try planNumbers(o[2].value)), ("antialias", o[3].value), ("points", try planNumbers(o[4].value))])
		})),
	])
}

/// One media feature of a sheet's `@media` bands, as Dragon wrote it for the device to evaluate: each comparison is
/// (op, value, num, den) as Dragon's `rt-band` reads it.
public struct StyleAtom: Sendable {
	public let feature: String
	public let comparisons: [(op: String, value: Double, num: Double, den: Double)]
	public let keyword: String
}

/// The `@media` bands of a page's styles: each band is the truth value of every atom; the state `@env#band` selects one.
public struct StyleBands: Sendable {
	public static let state = "@env#band"
	public let atoms: [StyleAtom]
	public let bands: [[Bool]]

	/// Dragon's translated `runLibraryCase`, which looks a band up by the root's size (`rt-band`); set by a host that links it.
	nonisolated(unsafe) public static var library: ((String) -> String)?

	/// The band of a page area `widthPx` x `heightPx` device px at `scale`: Dragon's own lookup (Chrome's media evaluation)
	/// when any atom reads more than the colour scheme, else the colour scheme alone.
	public func band(dark: Bool, widthPx: Double, heightPx: Double, scale: Double) throws -> Int {
		guard atoms.contains(where: { $0.feature != "prefers-color-scheme" }) else { return try band(dark: dark) }
		guard let library = StyleBands.library else {
			throw PayloadError(path: "style.bands", reason: "@media \(atoms.map(\.feature)) needs Dragon's band lookup, which this host does not link")
		}
		let bits = { (v: Double) in "\"\(String(v.bitPattern, radix: 16).leftPadded(16))\"" }
		let atomsText = atoms.map { atom in
			"[\"\(atom.feature)\",\"\(atom.keyword)\",[\(atom.comparisons.map { "[\"\($0.op)\",\(bits($0.value)),\(bits($0.num)),\(bits($0.den))]" }.joined(separator: ","))]]"
		}.joined(separator: ",")
		let bandsText = bands.map { "[\($0.map { $0 ? "true" : "false" }.joined(separator: ","))]" }.joined(separator: ",")
		// A phone's readings: a coarse primary pointer that does not hover, and no fine pointer.
		let readings = "[\"coarse\",false,true,false,false,false,\(dark)]"
		let line = "[\"rt-band\",[[\(atomsText)],[\(bandsText)]],[[\(bits(widthPx.rounded())),\(bits(heightPx.rounded())),\(bits(scale)),\(readings)]]]"
		let result = try Reader(JSONValue.parse(Data(library(line).utf8)), at: "band lookup").array()
		guard result.count == 2, try result[0].string() == "ok", let size = try result[1].array().first, try size.array().count == 3 else {
			throw PayloadError(path: "band lookup", reason: "Dragon's band lookup failed at \(widthPx) x \(heightPx) px: \(String(decoding: Data(library(line).utf8), as: UTF8.self))")
		}
		let index = try planNumber(try size.array()[2].value)
		guard index >= 0, index < Double(bands.count), index == index.rounded() else { throw PayloadError(path: "band lookup", reason: "band \(index) is not a band") }
		return Int(index)
	}

	/// The band the device is in by the colour scheme alone; an atom of any other feature needs the size (above).
	public func band(dark: Bool) throws -> Int {
		let truth = try atoms.map { atom -> Bool in
			guard atom.feature == "prefers-color-scheme", atom.comparisons.isEmpty else {
				throw PayloadError(path: "style.bands", reason: "the media feature \(atom.feature) needs the page's size")
			}
			switch atom.keyword {
			case "any": return true
			case "dark": return dark
			case "light": return !dark
			default: throw PayloadError(path: "style.bands", reason: "prefers-color-scheme: \(atom.keyword) is not a colour scheme")
			}
		}
		guard let index = bands.firstIndex(of: truth) else {
			throw PayloadError(path: "style.bands", reason: "no band holds the atoms \(truth)")
		}
		return index
	}
}

/// A system sheet's styles: one export per resting height, each laid out in that height's content area.
/// A number the page's styles read while the app runs (a payload slot), with the value Dragon exported the page at.
public struct StyleSlot: Equatable, Sendable {
	public let id: String
	public let initial: Double
	public let integer: Bool
}

/// One assignment's interaction level: Dragon's interaction runtime tables (JSON text for `rt-interaction`), the node each table
/// index names, each address inside a list row with its list (the row template; the state applies to the touched copy), and the
/// entry of each state in the export's assignments.
public struct StyleInteractionLevel: Sendable {
	public let tables: String
	public let addresses: [String]
	public let rows: [String: String]
	public let entries: [Int]
}

public struct SheetStyle: Sendable {
	public let node: String
	public let heights: [(snapPoint: Double, style: StyleExport)]
}

/// One target of a decoded `dragon.native-style-export/0` or `/1` file; `/0` reads as one assignment and no states.
public struct StyleExport: Sendable {
	public let fonts: [(id: String, file: String)]
	public private(set) var viewport: (width: Double, height: Double)
	public private(set) var dpr: Double
	public let states: [StyleState]
	public let initial: Int
	/// Every reachable combination of states, each a complete node list, with each state's value in it.
	public private(set) var assignments: [(values: [String: NativeValue], nodes: [StyleNode], canvas: RGBA?, body: RGBA?)]
	/// `next[a][s][v]`: the assignment reached from `a` by setting state `s` to its `v`-th value; -1 when unreachable.
	public let next: [[[Int]]]
	/// Why Dragon does not call this target shipping output yet; nil when it is `ready`.
	public let notReady: String?
	/// Only for a sheet with `@media`: its bands, selected by the state `@env#band`.
	public let bands: StyleBands?
	/// Each assignment's page scroll range in device px; nil when Dragon does not decide it (see `pageScrollUndecided`).
	public private(set) var pageScrolls: [ScrollOffsetRange?]
	/// POSX-s scroll: each assignment's sticky boxes as Dragon's plan layout wrote them (device px), which `runMarklessSticky` reads back.
	public private(set) var pageSticky: [[StickyRow]] = []
	/// Dragon's reason, for this target, when it leaves a page scroll range undecided.
	public private(set) var pageScrollUndecided: String?
	/// Each system sheet's content, laid out as its own document at every resting height (app style files only).
	public var sheets: [SheetStyle] = []
	/// Each system face the export names, by id: the platform font this host draws it with.
	public var systemFaces: [String: SystemFace] = [:]
	/// Dragon's layout plan (`dragon.markless-plan/1`) as JSON text: with it the page lays out at the screen's own size.
	public var plan: String?
	/// Per assignment: each Dragon id the plan's geometry names, with the export's id for it (empty: no ids differ).
	public var planNames: [[String: String]] = []
	/// Per assignment: the Dragon ids of the inline boxes in the plan's layout tree, whose texts and boxes the export parents to
	/// their block container (empty without a plan).
	public var inlineBoxes: [Set<String>] = []
	/// The slots `laidOut` takes values for, in the order it takes them; empty when no style follows a slot.
	public var slots: [StyleSlot] = []
	/// Each list whose rows the phone lays out: the box its rows hang from and the Dragon ids of one row's top boxes, in order.
	public var planRepeats: [PlanRepeat] = []
	/// Dragon's animator tables for the page's transitions and animations (JSON text), which the host runs with the plan.
	public var anim: String?
	/// Per assignment, its interaction states (`:hover`, `:active`, `:focus`): the runtime tables and the entries the states are,
	/// after the assignments in `assignments`, `pageScrolls` and the plan. Empty when the page has none.
	public var interaction: [StyleInteractionLevel] = []

	/// The assignment an entry belongs to: itself, or for an interaction state the assignment whose level holds it.
	public func assignmentOf(entry: Int) -> Int {
		interaction.firstIndex { $0.entries.contains(entry) } ?? entry
	}

	/// `entry` and each assignment that differs from it only in its @media band; an interaction state is laid out only when shown.
	public func bandTwins(of entry: Int) -> Set<Int> {
		guard assignments.indices.contains(entry) else { return [entry] }
		let values = assignments[entry].values
		return Set(next.indices.filter { k in
			assignments[k].values.allSatisfy { key, value in
				key == StyleBands.state || values[key].map { $0.strictlyEquals(value) } ?? false
			}
		}).union([entry])
	}

	/// Reads the target this host renders, by Dragon target name (`ios`) and the backend it must have been lowered for.
	public static func decode(_ data: Data, target: String = "ios", backend: String = "uikit") throws -> StyleExport {
		let root = try Reader(JSONValue.parse(data), at: "style")
		let fields = try root.object(required: ["schema", "units", "fonts", "targets"], optional: ["compiler", "component", "source", "warnings", "systemFonts", "fontMode", "slots"])
		if fields.has("fontMode") {
			let fontMode = try fields["fontMode"]
			guard ["system", "pinned"].contains(try fontMode.string()) else { throw fontMode.fail("is neither system nor pinned") }
		}
		let schema = try fields["schema"].string()
		guard dragonStyleExportSchemas.contains(schema) else {
			throw PayloadError(path: "style.schema", reason: "unsupported schema \"\(schema)\", this host reads \(dragonStyleExportSchemas)")
		}
		let perState = schema == dragonStyleExportSchemas[1]
		let units = try fields["units"].string()
		guard dragonStyleExportUnits.contains(units) else { throw PayloadError(path: "style.units", reason: "unsupported units \"\(units)\"") }
		// Dragon's reason, for this target, when it leaves the page's scroll range undecided.
		var pageScrollUndecided: String?
		if fields.has("warnings") {
			for warning in try fields["warnings"].array() {
				let w = try warning.object(["code", "message"])
				let message = try w["message"].string()
				if try w["code"].string() == "DRAGON_PAGE_SCROLL_UNDECIDED", message.hasPrefix("\(target): ") {
					pageScrollUndecided = String(message.dropFirst(target.count + 2))
				}
			}
		}
		var style = try decodeTarget(
			try fields["targets"].field(target), perState: perState, fonts: try decodeFonts(fields["fonts"]), backend: backend,
			pageScrollUndecided: pageScrollUndecided)
		if fields.has("systemFonts") { style.systemFaces = try decodeSystemFonts(fields["systemFonts"], target: target) }
		if fields.has("slots") { style.slots = try decodeSlots(fields["slots"], plan: style.plan) }
		return style
	}

	/// An export's `slots`: each number Dragon's plan reads, once, with the value it is laid out at.
	private static func decodeSlots(_ reader: Reader, plan: String?) throws -> [StyleSlot] {
		let slots = try reader.array().map { slot in
			let f = try slot.object(required: ["id", "initial"], optional: ["integer"])
			if f.has("integer"), try !f["integer"].bool() { throw PayloadError(path: try f["integer"].path, reason: "integer is only ever true") }
			return StyleSlot(id: try f["id"].string(), initial: try f["initial"].number(), integer: f.has("integer"))
		}
		guard Set(slots.map(\.id)).count == slots.count else { throw PayloadError(path: "style.slots", reason: "a slot is listed twice") }
		guard slots.isEmpty || plan != nil else { throw PayloadError(path: "style.slots", reason: "style values that follow state need Dragon's layout plan, and the export has none") }
		return slots
	}

	/// Reads an app's `markless.native-app-style/0` for one target: each styled route's styles, by route pattern.
	public static func decodeApp(_ data: Data, target: String = "ios", backend: String = "uikit") throws -> [String: StyleExport] {
		let root = try Reader(JSONValue.parse(data), at: "style")
		let fields = try root.object(required: ["version", "units", "warnings", "fonts", "targets"], optional: ["systemFonts"])
		let systemFaces = fields.has("systemFonts") ? try decodeSystemFonts(fields["systemFonts"], target: target) : [:]
		let version = try fields["version"].string()
		guard version == nativeAppStyleVersion else {
			throw PayloadError(path: "style.version", reason: "unsupported version \"\(version)\", this host reads \(nativeAppStyleVersion)")
		}
		let units = try fields["units"].string()
		guard dragonStyleExportUnits.contains(units) else { throw PayloadError(path: "style.units", reason: "unsupported units \"\(units)\"") }
		for warning in try fields["warnings"].array() {
			let w = try warning.object(["pattern", "code", "message"])
			_ = (try w["pattern"].string(), try w["code"].string(), try w["message"].string())
		}
		let fonts = try decodeFonts(fields["fonts"])
		let chosen = try fields["targets"].field(target)
		let targetFields = try chosen.object(required: ["backend", "viewport", "dpr", "writes", "routes"], optional: ["nodes"])
		let writes = try targetFields["writes"].array().map { list in _ = try list.array(); return list.value }
		let withWrites = { (node: Reader) throws -> JSONValue in
			guard case let .object(entries) = node.value else { throw node.fail("expected an object") }
			let index = Int(try node.field("writes").number())
			guard writes.indices.contains(index) else { throw node.fail("writes \(index) is not in the target's writes") }
			return .object(entries.map { $0.0 == "writes" ? ("writes", writes[index]) : $0 })
		}
		let pool: [JSONValue] = targetFields.has("nodes") ? try targetFields["nodes"].array().map(withWrites) : []
		var routes: [String: StyleExport] = [:]
		let raw = { (fields: Fields, key: String) throws -> (String, JSONValue) in (key, try fields[key].value) }
		let expanded = { (reader: Reader, f: Fields, viewport: (String, JSONValue)) throws -> StyleExport in
			let expandAssignment = { (assignment: Reader) throws -> JSONValue in
				let a = try assignment.object(required: ["values", "nodes", "canvas"], optional: ["bodyBackground"])
				let nodes: [JSONValue] = try a["nodes"].array().map { node in
					guard case .number = node.value else { return try withWrites(node) }
					let index = Int(try node.number())
					guard pool.indices.contains(index) else { throw node.fail("node \(index) is not in the target's nodes") }
					return pool[index]
				}
				let body: [(String, JSONValue)] = a.has("bodyBackground") ? [("bodyBackground", try a["bodyBackground"].value)] : []
				return .object([("values", try a["values"].value), ("nodes", .array(nodes)), ("canvas", try a["canvas"].value)] + body)
			}
			let assignments: [JSONValue] = try f["assignments"].array().map(expandAssignment)
			var page: [(String, JSONValue)] = [
				try raw(targetFields, "backend"), viewport, try raw(targetFields, "dpr"),
				try raw(f, "readiness"), try raw(f, "states"), try raw(f, "initial"), ("assignments", .array(assignments)), try raw(f, "next"),
			]
			if f.has("bands") { page.append(("bands", try f["bands"].value)) }
			for key in ["plan", "planNames", "planRepeats", "anim"] where f.has(key) { page.append((key, try f[key].value)) }
			if f.has("interaction") {
				let levels: [JSONValue] = try f["interaction"].object(["levels"])["levels"].array().map { level in
					guard case let .object(entries) = level.value else { throw level.fail("expected an object") }
					let states = try level.field("states").array().map(expandAssignment)
					return .object(entries.map { $0.0 == "states" ? ("states", .array(states)) : $0 })
				}
				page.append(("interaction", .object([("levels", .array(levels))])))
			}
			return try decodeTarget(try Reader(.object(page), at: reader.path), perState: true, fonts: fonts, backend: backend)
		}
		for route in try targetFields["routes"].array() {
			let f = try route.object(
				required: ["pattern", "component", "compiler", "readiness", "states", "initial", "next", "assignments"],
				optional: ["bands", "sheets", "plan", "planNames", "planRepeats", "slots", "anim", "interaction"])
			let pattern = try f["pattern"].string()
			_ = (try f["component"].string(), try f["compiler"].string())
			guard routes[pattern] == nil else { throw route.fail("route \(pattern) is listed twice") }
			var style = try expanded(route, f, try raw(targetFields, "viewport"))
			style.systemFaces = systemFaces
			if f.has("slots") { style.slots = try decodeSlots(f["slots"], plan: style.plan) }
			if f.has("sheets") {
				style.sheets = try f["sheets"].array().map { sheet in
					let s = try sheet.object(["node", "heights"])
					let heights = try s["heights"].array().map { height in
						let h = try height.object(
							required: ["snapPoint", "viewport", "readiness", "states", "initial", "next", "assignments"], optional: ["bands"])
						return (snapPoint: try h["snapPoint"].number(), style: try expanded(height, h, try raw(h, "viewport")))
					}
					guard !heights.isEmpty else { throw sheet.fail("a sheet's styles need at least one resting height") }
					return SheetStyle(node: try s["node"].string(), heights: heights)
				}
			}
			routes[pattern] = style
		}
		return routes
	}

	/// `systemFonts`: each system face with this target's face; an entry without this target, or a face of an unknown kind, is an error.
	private static func decodeSystemFonts(_ reader: Reader, target: String) throws -> [String: SystemFace] {
		var out: [String: SystemFace] = [:]
		for entry in try reader.array() {
			let f = try entry.object(required: ["id"], optional: ["ios", "android"])
			let id = try f["id"].string()
			guard id.hasPrefix("system:") else { throw entry.fail("\(id) is not a system face id") }
			guard out[id] == nil else { throw entry.fail("\(id) is listed twice") }
			guard f.has(target) else { throw entry.fail("\(id) has no \(target) face") }
			let face = try f[target].object(["face"])["face"]
			switch try face.field("kind").string() {
			case "system":
				let s = try face.object(["kind", "weight", "design"])
				let weight = try s["weight"].number()
				guard weight >= -1, weight <= 1 else { throw face.fail("weight \(weight) is not a UIFont.Weight value") }
				let design = try s["design"].string()
				guard ["default", "serif", "monospaced"].contains(design) else { throw face.fail("unknown system design \"\(design)\"") }
				out[id] = .system(weight: weight, design: design)
			case "name":
				let n = try face.object(["kind", "postScriptName"])
				let name = try n["postScriptName"].string()
				guard !name.isEmpty else { throw face.fail("an empty PostScript name") }
				out[id] = .named(postScriptName: name)
			case let kind:
				throw face.fail("unknown system face kind \"\(kind)\"")
			}
		}
		return out
	}

	fileprivate static func decodeLines(_ reader: Reader) throws -> [TextLine] {
		try reader.array().map { line in
			let l = try line.object(["top", "baseline", "runs"])
			let runs = try l["runs"].array().map { run in
				let r = try run.object(["face", "size", "glyphs", "xs"])
				let size = try r["size"].number()
				guard size > 0 else { throw run.fail("\(size) is not a positive size") }
				let glyphs = try r["glyphs"].array().map { g -> UInt16 in
					let v = try g.number()
					guard v >= 0, v <= 65535, v == v.rounded() else { throw g.fail("\(v) is not a glyph id") }
					return UInt16(v)
				}
				let xs = try r["xs"].array().map { try $0.number() }
				guard !glyphs.isEmpty else { throw run.fail("a run needs at least one glyph") }
				guard xs.count == glyphs.count else { throw run.fail("a run needs one x per glyph") }
				return GlyphRun(face: try r["face"].string(), size: size, glyphs: glyphs, xs: xs)
			}
			return TextLine(top: try l["top"].number(), baseline: try l["baseline"].number(), runs: runs)
		}
	}

	private static func decodeFonts(_ reader: Reader) throws -> [(id: String, file: String)] {
		try reader.array().map { font in
			let field = try font.object(["id", "file"])
			return (id: try field["id"].string(), file: try field["file"].string())
		}
	}

	private static func decodeTarget(
		_ chosen: Reader, perState: Bool, fonts: [(id: String, file: String)], backend: String, pageScrollUndecided: String? = nil
	) throws -> StyleExport {
		let targetFields = try chosen.object(
			required: perState ? ["backend", "viewport", "dpr", "states", "initial", "assignments", "next"] : ["backend", "viewport", "dpr", "nodes"],
			optional: perState ? ["readiness", "bands", "plan", "planNames", "planRepeats", "anim", "interaction"] : [])
		var notReady: String?
		if targetFields.has("readiness") {
			let readiness = try targetFields["readiness"]
			switch try readiness.field("kind").string() {
			case "ready": _ = try readiness.object(["kind"])
			case "analysis-only": notReady = try readiness.object(["kind", "reason"])["reason"].string()
			case let kind: throw PayloadError(path: readiness.path + ".kind", reason: "unknown readiness \"\(kind)\"")
			}
		}
		let actualBackend = try targetFields["backend"].string()
		guard actualBackend == backend else {
			throw PayloadError(path: chosen.path + ".backend", reason: "expected backend \(backend), found \(actualBackend)")
		}
		let viewport = try targetFields["viewport"].object(["width", "height"])
		let checkedNodes = { (reader: Reader) throws -> [StyleNode] in
			let nodes = try reader.array().map(decodeNode)
			var seen = Set<String>()
			for node in nodes {
				guard seen.insert(node.id).inserted else { throw PayloadError(path: reader.path, reason: "duplicate node \(node.id)") }
				if let parent = node.parent, !seen.contains(parent) {
					throw PayloadError(path: reader.path, reason: "\(node.id)'s parent \(parent) is not an earlier node")
				}
			}
			return nodes
		}
		var states: [StyleState] = []
		var initial = 0
		var assignments: [(values: [String: NativeValue], nodes: [StyleNode], canvas: RGBA?, body: RGBA?)]
		var next: [[[Int]]] = [[]]
		var pageScrolls: [ScrollOffsetRange?] = []
		var interaction: [StyleInteractionLevel] = []
		if perState {
			states = try targetFields["states"].array().map { state in
				let f = try state.object(["key", "domain"])
				return StyleState(key: try f["key"].string(), domain: try f["domain"].array().map { NativeValue(json: $0.value) })
			}
			let decodeAssignment = { (assignment: Reader) throws -> (values: [String: NativeValue], nodes: [StyleNode], canvas: RGBA?, body: RGBA?) in
				let f = try assignment.object(required: ["values", "nodes"], optional: ["canvas", "bodyBackground", "pageScroll", "colorScheme"])
				if f.has("colorScheme") {
					let scheme = try f["colorScheme"].string()
					guard scheme == "light" || scheme == "dark" else { throw PayloadError(path: assignment.path + ".colorScheme", reason: "colorScheme is light or dark, not \(scheme)") }
				}
				pageScrolls.append(f.has("pageScroll") ? try decodeRange(try f["pageScroll"]) : nil)
				let valuesReader = try f["values"]
				var values: [String: NativeValue] = [:]
				for key in try valuesReader.keys() { values[key] = NativeValue(json: try valuesReader.field(key).value) }
				guard Set(values.keys) == Set(states.map(\.key)) else { throw PayloadError(path: valuesReader.path, reason: "an assignment's values must name every state") }
				let canvas = f.has("canvas") ? try decodeColor(try f["canvas"]) : nil
				if let canvas, canvas.alpha != 255 { throw PayloadError(path: assignment.path + ".canvas", reason: "the canvas is not opaque") }
				// body's own background, painted in its box over the canvas; null when it is the canvas.
				let bodyReader: Reader? = f.has("bodyBackground") ? try f["bodyBackground"] : nil
				let body = try bodyReader.flatMap { $0.isNull ? nil : try decodeColor($0) }
				if let body, body.alpha != 255 { throw PayloadError(path: assignment.path + ".bodyBackground", reason: "body's background is not opaque") }
				return (values, try StyleExport.placingRuntimeImages(try checkedNodes(try f["nodes"]), exported: true), canvas, body)
			}
			assignments = try targetFields["assignments"].array().map(decodeAssignment)
			initial = Int(try targetFields["initial"].number())
			next = try targetFields["next"].array().map { row in try row.array().map { column in try column.array().map { Int(try $0.number()) } } }
			let shapeIsRight = next.count == assignments.count && next.allSatisfy { row in
				row.count == states.count && zip(row, states).allSatisfy { column, state in
					column.count == state.domain.count && column.allSatisfy { $0 == -1 || assignments.indices.contains($0) }
				}
			}
			guard shapeIsRight, assignments.indices.contains(initial) else {
				throw PayloadError(path: chosen.path, reason: "the next table and initial do not match the assignments and states")
			}
			// Each assignment's interaction states are entries after the assignments, in level then state order, as the plan's are.
			if targetFields.has("interaction") {
				let reader = try targetFields["interaction"]
				let levelReaders = try reader.object(["levels"])["levels"].array()
				guard levelReaders.count == assignments.count else {
					throw PayloadError(path: reader.path, reason: "\(levelReaders.count) interaction levels for \(assignments.count) assignments")
				}
				interaction = try levelReaders.map { level in
					let l = try level.object(required: ["tables", "addresses", "states", "matches"], optional: ["rows", "planAssignments"])
					let addresses = try l["addresses"].array().map { try $0.string() }
					var rows: [String: String] = [:]
					if l.has("rows") { let r = try l["rows"]; for key in try r.keys() { rows[key] = try r.field(key).string() } }
					let states = try l["states"].array()
					guard try l["matches"].array().count == states.count else { throw level.fail("each state needs its matches") }
					var entries: [Int] = []
					for state in states {
						entries.append(assignments.count)
						assignments.append(try decodeAssignment(state))
					}
					if l.has("planAssignments") {
						let planned = try l["planAssignments"].array().map { Int(try $0.number()) }
						guard planned == entries else { throw level.fail("the states' plan assignments are not the entries after the assignments") }
					}
					return StyleInteractionLevel(tables: try l["tables"].value.jsonText, addresses: addresses, rows: rows, entries: entries)
				}
			}
		} else {
			assignments = [([:], try StyleExport.placingRuntimeImages(try checkedNodes(try targetFields["nodes"]), exported: true), nil, nil)]
			pageScrolls = [nil]
		}
		var bands: StyleBands?
		if targetFields.has("bands") {
			let reader = try targetFields["bands"]
			let b = try reader.object(["atoms", "bands", "conditions"])
			let atoms = try b["atoms"].array().map { atom in
				let a = try atom.object(["feature", "comparisons", "keyword"])
				let comparisons = try a["comparisons"].array().map { c in
					let f = try c.object(["op", "value", "num", "den"])
					return (op: try f["op"].string(), value: try f["value"].number(), num: try f["num"].number(), den: try f["den"].number())
				}
				return StyleAtom(feature: try a["feature"].string(), comparisons: comparisons, keyword: try a["keyword"].string())
			}
			let rows = try b["bands"].array().map { row in try row.array().map { try $0.bool() } }
			_ = try b["conditions"].array().map { try $0.string() }
			guard rows.allSatisfy({ $0.count == atoms.count }),
				let state = states.first(where: { $0.key == StyleBands.state }), state.domain.count == rows.count
			else { throw PayloadError(path: reader.path, reason: "the bands do not match the atoms and the \(StyleBands.state) state") }
			bands = StyleBands(atoms: atoms, bands: rows)
		} else if states.contains(where: { $0.key == StyleBands.state }) {
			throw PayloadError(path: chosen.path, reason: "\(StyleBands.state) is a state, but there are no bands")
		}
		var style = StyleExport(
			fonts: fonts, viewport: (try viewport["width"].number(), try viewport["height"].number()),
			dpr: try targetFields["dpr"].number(), states: states, initial: initial, assignments: assignments, next: next, notReady: notReady,
			bands: bands, pageScrolls: pageScrolls, pageScrollUndecided: pageScrollUndecided)
		style.interaction = interaction
		if targetFields.has("plan") {
			let plan = try targetFields["plan"]
			guard try plan.field("version").string() == dragonMarklessPlanVersion else {
				throw PayloadError(path: plan.path + ".version", reason: "this host reads \(dragonMarklessPlanVersion)")
			}
			style.plan = plan.value.jsonText
			style.inlineBoxes = try inlineBoxes(ofPlan: plan)
		} else if let node = assignments.lazy.flatMap(\.nodes).first(where: \.drawsSelectArrow) {
			throw PayloadError(
				path: chosen.path, reason: "\(node.id) draws a drop-down arrow, whose geometry only Dragon's plan layout gives, and the export has no plan")
		} else if let node = assignments.lazy.flatMap(\.nodes).first(where: \.drawsCheckbox) {
			throw PayloadError(
				path: chosen.path, reason: "\(node.id) draws a themed checkbox, whose marks only Dragon's plan layout gives, and the export has no plan")
		}
		if targetFields.has("planNames") {
			let perAssignment = try targetFields["planNames"]
			style.planNames = try perAssignment.array().map { assignment in
				var map: [String: String] = [:]
				for pair in try assignment.array() {
					let names = try pair.array()
					guard names.count == 2 else { throw pair.fail("expected a Dragon id and the export's id") }
					map[try names[0].string()] = try names[1].string()
				}
				return map
			}
			guard style.planNames.count == assignments.count else {
				throw perAssignment.fail("names \(style.planNames.count) assignments; the export has \(assignments.count)")
			}
		}
		if targetFields.has("anim") {
			guard style.plan != nil else { throw try targetFields["anim"].fail("animator tables need a layout plan") }
			style.anim = try targetFields["anim"].value.jsonText
		}
		if targetFields.has("planRepeats") {
			style.planRepeats = try targetFields["planRepeats"].array().map { r in
				let f = try r.object(required: ["id", "parent", "template"], optional: [])
				let template = try f["template"].array().map { try $0.string() }
				guard !template.isEmpty else { throw r.fail("a row has at least one box") }
				return PlanRepeat(id: try f["id"].string(), parent: try f["parent"].string(), template: template)
			}
		}
		return style
	}

	/// Each plan assignment's variant's layout tree, read for the boxes whose kind is `inline`.
	private static func inlineBoxes(ofPlan plan: Reader) throws -> [Set<String>] {
		func collect(_ box: Reader, into ids: inout Set<String>) throws {
			let fields = try box.keys()
			if try box.field("kind").string() == "inline" { ids.insert(try box.field("id").string()) }
			guard fields.contains("children") else { return }
			for child in try box.field("children").array() { try collect(child, into: &ids) }
		}
		guard try plan.keys().contains("variants") else { return [] }
		let variants = try plan.field("variants").array().map { variant in
			var ids = Set<String>()
			try collect(try variant.field("root"), into: &ids)
			return ids
		}
		return try plan.field("assignments").array().map { assignment in
			let index = Int(try assignment.field("variant").number())
			guard variants.indices.contains(index) else { throw assignment.fail("names variant \(index); the plan has \(variants.count)") }
			return variants[index]
		}
	}

	/// This export laid out again by Dragon's plan for a page `width` x `height` points at `scale`: every assignment's frames,
	/// border widths, text lines, dashed borders and scroll ranges, in this screen's device pixels. `layout` is Dragon's
	/// translated `runMarklessLayout`. `slots` holds a value for each of the export's `slots`, in that order; the colours
	/// that follow them are written into each assignment's nodes. Without a plan the export is returned as it is.
	public func laidOut(
		width: Double, height: Double, scale: Double, slots values: [Double] = [], layout: (String) -> String,
		rows: ((Int) throws -> [String: [LaidOutRow]])? = nil, rowsLayout: ((String) -> String)? = nil,
		texts: [String: String] = [:], entries: Set<Int>? = nil, previous: StyleExport? = nil
	) throws -> StyleExport {
		guard let plan else { return self }
		guard values.count == slots.count else {
			throw PayloadError(path: "plan layout", reason: "the export has \(slots.count) slots and the layout was given \(values.count) values")
		}
		let slotted = !slots.isEmpty
		let hex = { (list: [Double]) -> JSONValue in .array(list.map { .string(String($0.bitPattern, radix: 16).leftPadded(16)) }) }
		let slotLine = slotted ? ",\"slots\":\(hex(values).jsonText)" : ""
		var out = self
		var pages: [ScrollOffsetRange?] = []
		var stickies: [[StickyRow]] = []
		var undecided: String?
		out.assignments = try assignments.indices.map { k in
			// An entry the page does not show yet keeps the boxes it had; the host lays it out when a state first shows it.
			if let entries, !entries.contains(k) {
				let kept = previous ?? self
				pages.append(k < kept.pageScrolls.count ? kept.pageScrolls[k] : nil)
				stickies.append(k < kept.pageSticky.count ? kept.pageSticky[k] : [])
				let a = kept.assignments[k]
				return (a.values, a.nodes, a.canvas, a.body)
			}
			let names = k < planNames.count ? planNames[k] : [:]
			let dragonId = Dictionary(names.map { ($1, $0) }, uniquingKeysWith: { a, _ in a })
			// An interaction state's rows are its assignment's; laid out in the state, a row of that assignment takes the state's look
			// (the host shows it on the touched copy only).
			let shown = !planRepeats.isEmpty ? try rows?(assignmentOf(entry: k)) : nil
			let rowEntry = { (a: Int) in a == self.assignmentOf(entry: k) ? k : a }
			var line = "{\"assignment\":\(k),\"dpr\":\(JSONValue.number(scale).jsonText),\"viewport\":{\"width\":\(JSONValue.number(width).jsonText),\"height\":\(JSONValue.number(height).jsonText)},\"safeArea\":{\"top\":0,\"right\":0,\"bottom\":0,\"left\":0},\"plan\":\(plan)\(slotLine)"
			if let shown {
				let lists = planRepeats.map { r -> JSONValue in
					// A list an arm hides at this assignment has no box to hold rows: its rows are not laid out there.
					let parentId = names[r.parent] ?? r.parent
					let parentShown = r.parent == "body" || assignments[k].nodes.first(where: { $0.id == parentId })?.frame != nil
					return .object([
						("parent", .string(r.parent)), ("template", .array(r.template.map { .string($0) })),
						("rows", .array((parentShown ? shown[r.id] ?? [] : []).map { row in
							.object([
								("key", .string(row.key)), ("assignment", .number(Double(rowEntry(row.assignment)))),
								("texts", .array(row.texts.sorted { $0.key < $1.key }.map { .array([.string(dragonId[$0.key] ?? $0.key), .string($0.value)]) })),
							] + (slotted ? [("slots", hex(zip(slots, values).map { row.slots[$0.id] ?? $1 }))] : []))
						})),
					])
				}
				line += ",\"rows\":\(JSONValue.array(lists).jsonText)"
			}
			// The page's own texts whose current string is not the one this assignment was laid out with, by Dragon id; a text an arm
			// hides there has no box to lay out.
			let nodeText = Dictionary(assignments[k].nodes.compactMap { node in node.frame == nil ? nil : node.text.map { (node.id, $0) } }, uniquingKeysWith: { a, _ in a })
			let changed = texts.filter { id, text in nodeText[id].map { $0 != text } ?? false }.sorted { $0.key < $1.key }
			// The page's texts as this layout lays them out: the changed ones with their current string.
			let relaidTexts = Dictionary(changed.map { ($0.key, $0.value) }, uniquingKeysWith: { a, _ in a })
			let live = shown != nil || !changed.isEmpty
			if !changed.isEmpty {
				if shown == nil { line += ",\"rows\":[]" }
				line += ",\"texts\":" + JSONValue.array(changed.map { .array([.string(dragonId[$0.key] ?? $0.key), .string($0.value)]) }).jsonText
			}
			line += ",\"sticky\":true,\"textAreas\":true}"
			guard !live || rowsLayout != nil else { throw PayloadError(path: "plan layout", reason: "a page whose texts follow state needs Dragon's live layout") }
			guard shown == nil || rowsLayout != nil else { throw PayloadError(path: "plan layout", reason: "a page with rows needs Dragon's rows layout") }
			let result = try Reader(JSONValue.parse(Data((live ? rowsLayout!(line) : layout(line)).utf8)), at: "plan layout")
			let parts = try result.array()
			// Dragon's live layout answers a slotted page with each row's write numbers, an empty list when it lays out texts and no rows.
			let fixed = !slotted ? 3 : (live ? 5 : 4)
			guard parts.count >= fixed, parts.count <= fixed + 4, try parts[0].string() == "ok" else {
				throw PayloadError(path: "plan layout", reason: "Dragon's layout at \(width) x \(height) points and \(scale)x failed: \(result.value.jsonText)")
			}
			// A row's copy is named "<Dragon id>@<key>": the export names it by the template's export id and the key.
			let exportId = { (id: String) -> String in
				guard let at = id.firstIndex(of: "@") else { return names[id] ?? id }
				let base = String(id[..<at])
				return "\(names[base] ?? base)\(id[at...])"
			}
			var arrows: [String: (strokeWidth: Double, points: [Double])] = [:]
			var marks: [String: CheckboxMarks] = [:]
			var sticky: [StickyRow] = []
			var areas: [String: TextAreaLines] = [:]
			var tags: Set<String> = []
			for tagged in parts[fixed...] {
				let suffix = try tagged.array()
				guard suffix.count == 2 else { throw tagged.fail("expected [tag, entries]") }
				let tag = try suffix[0].string()
				guard tags.insert(tag).inserted else { throw tagged.fail("\(tag) is given twice") }
				if tag == "sticky" {
					for entry in try suffix[1].array() {
						let s = try entry.array()
						guard s.count == 15 else { throw entry.fail("expected an id and 14 numbers") }
						sticky.append(StickyRow(id: exportId(try s[0].string()), row: entry.value))
					}
					continue
				}
				if tag == "text-areas" {
					for entry in try suffix[1].array() {
						let t = try entry.array()
						guard t.count == 4 else { throw entry.fail("expected id, pitch, above and insets") }
						let insets = try t[3].array().map { try planNumber($0.value) }
						guard insets.count == 4 else { throw t[3].fail("insets are top, right, bottom and left") }
						areas[exportId(try t[0].string())] = TextAreaLines(pitch: try planNumber(t[1].value), above: try planNumber(t[2].value), insets: insets)
					}
					continue
				}
				if tag == "checkbox-marks" {
					for entry in try suffix[1].array() {
						let m = try entry.array()
						guard m.count == 11 else { throw entry.fail("expected id, square, plain, radius, insets, border width, check and check width") }
						let id = exportId(try m[0].string())
						guard marks[id] == nil else { throw entry.fail("\(id) has two checkbox marks") }
						let n = { (k: Int) throws -> Double in try planNumber(m[k].value) }
						let check = try m[9].array().map { try planNumber($0.value) }
						guard check.count == 6 else { throw m[9].fail("a check is three points") }
						marks[id] = CheckboxMarks(
							originX: 0, originY: 0, x: try n(1), y: try n(2), side: try n(3), plain: try m[4].bool(), radius: try n(5),
							backgroundInset: try n(6), borderInset: try n(7), borderWidth: try n(8), check: check, checkWidth: try n(10))
					}
					continue
				}
				guard tag == "menulist-arrows" else { throw tagged.fail("unknown tag \(tag)") }
				for arrow in try suffix[1].array() {
					let a = try arrow.array()
					guard a.count == 3 else { throw arrow.fail("expected id, stroke width and path") }
					let id = exportId(try a[0].string())
					guard arrows[id] == nil else { throw arrow.fail("\(id) has two arrows") }
					var points: [Double] = []
					for (k, segment) in try a[2].array().enumerated() {
						let g = try segment.array()
						guard g.count == 3, try g[0].string() == (k == 0 ? "move" : "line") else {
							throw segment.fail("an arrow's path is a move and then lines")
						}
						points += [try planNumber(g[1].value), try planNumber(g[2].value)]
					}
					guard points.count >= 4 else { throw arrow.fail("an arrow's path needs a move and a line") }
					arrows[id] = (try planNumber(a[1].value), points)
				}
			}
			stickies.append(sticky)
			let bits = { (reader: Reader) throws -> JSONValue in try planNumbers(reader.value) }
			let page = try parts[1].array()
			// Dragon's ["undecided", node, reason] when it could not decide the page's range at this size.
			if page.count == 3 { undecided = "\(try page[1].string()): \(try page[2].string())" }
			pages.append(page.count == 3 ? nil : try StyleExport.decodeRange(Reader(.object(zip(["minX", "maxX", "minY", "maxY"], try page.map { try bits($0) }).map { ($0, $1) }), at: parts[1].path)))
			var geometry: [String: Reader] = [:]
			for node in try parts[2].array() { geometry[exportId(try node.array()[0].string())] = node }
			var slotWrites: [String: [(kind: String, path: Reader, value: Double)]] = [:]
			if slotted {
				for write in try parts[3].array() {
					let w = try write.array()
					guard w.count == 4 else { throw write.fail("expected node, write kind, path and value") }
					slotWrites[try w[0].string(), default: []].append((try w[1].string(), w[2], try planNumber(w[3].value)))
				}
			}
			// Each row's own write numbers, by row key and the template node they write: the row's copy takes them.
			var rowWrites: [String: [String: [(kind: String, path: Reader, value: Double)]]] = [:]
			if slotted, shown != nil {
				for entry in try parts[4].array() {
					let e = try entry.array()
					guard e.count == 2 else { throw entry.fail("expected a row key and its writes") }
					var own: [String: [(kind: String, path: Reader, value: Double)]] = [:]
					for write in try e[1].array() {
						let w = try write.array()
						guard w.count == 4 else { throw write.fail("expected node, write kind, path and value") }
						own[try w[0].string(), default: []].append((try w[1].string(), w[2], try planNumber(w[3].value)))
					}
					rowWrites[try e[0].string()] = own
				}
			}
			let assignment = assignments[k]
			// The template of each list: one row's nodes, which no view shows; each row is a copy of them laid out here.
			var template: [String: (list: PlanRepeat, top: Bool)] = [:]
			if shown != nil {
				for r in planRepeats {
					let tops = Set(r.template.map { names[$0] ?? $0 })
					for node in assignment.nodes {
						var at: String? = node.id
						while let id = at, !tops.contains(id) { at = assignment.nodes.first { $0.id == id }?.parent }
						if at != nil { template[node.id] = (r, tops.contains(node.id)) }
					}
				}
			}
			var withRows: [StyleNode] = []
			for node in assignment.nodes {
				guard let (list, top) = template[node.id], let shown else {
					withRows.append(node)
					continue
				}
				withRows.append(node.hidden())
				for row in shown[list.id] ?? [] {
					guard let own = assignments[rowEntry(row.assignment)].nodes.first(where: { $0.id == node.id }) else {
						throw PayloadError(path: "plan layout", reason: "assignment \(row.assignment) has no node \(node.id) for row \(row.key)")
					}
					let copy = StyleNode(
						id: "\(node.id)@\(row.key)", parent: top ? node.parent : node.parent.map { "\($0)@\(row.key)" },
						isText: own.isText, isAnonymous: own.isAnonymous, text: own.isText ? (row.texts[node.id] ?? own.text) : own.text,
						frame: own.frame, borderWidths: own.borderWidths, writes: own.writes, borderOps: own.borderOps, scrollRange: own.scrollRange,
						lines: own.lines)
					// A row's text its item empties has no box, as on the web.
					if copy.isText, copy.text == "" {
						withRows.append(copy.hidden())
						continue
					}
					withRows.append(try (rowWrites[row.key]?[node.id] ?? []).reduce(copy) { try StyleExport.patched($0, kind: $1.kind, path: $1.path, value: $1.value) })
				}
			}
			if let missing = slotWrites.keys.first(where: { id in !assignment.nodes.contains { $0.id == id } }) {
				throw PayloadError(path: "plan layout", reason: "Dragon's layout writes a slot into \(missing), which assignment \(k) does not have")
			}
			var nodes = try withRows.map { node in
				try (slotWrites[node.id] ?? []).reduce(node) { try StyleExport.patched($0, kind: $1.kind, path: $1.path, value: $1.value) }
			}.map { node -> StyleNode in
				guard node.frame != nil else { return node }
				guard let g = geometry[node.id] else {
					// A text whose state emptied it has no box, as on the web.
					if node.isText, relaidTexts[node.id] == "" { return node.hidden() }
					throw PayloadError(path: "plan layout", reason: "Dragon's layout has no box for \(node.id)")
				}
				let f = try g.array()
				guard f.count == 6 else { throw g.fail("expected id, frame, border widths, lines, border operations and scroll range") }
				let frame = try f[1].array().map { try planNumber($0.value) }
				guard frame.count == 4 else { throw f[1].fail("expected x, y, width and height") }
				let widths = f[2].isNull ? nil : try f[2].array().map { try planNumber($0.value) }
				let lines = f[3].isNull ? nil : try StyleExport.decodeLines(Reader(.array(try f[3].array().map { line in
					let l = try line.array()
					return .object([("top", try bits(l[0])), ("baseline", try bits(l[1])), ("runs", .array(try l[2].array().map { run in
						let r = try run.array()
						return .object([("face", r[0].value), ("size", try bits(r[1])), ("glyphs", try bits(r[2])), ("xs", try bits(r[3]))])
					}))])
				}), at: f[3].path))
				let ops = f[4].isNull ? nil : try StyleExport.decodeBorderOps(Reader(try planBorderOps(f[4]), at: f[4].path))
				let range = f[5].isNull ? nil : try StyleExport.decodeRange(Reader(.object(zip(["minX", "maxX", "minY", "maxY"], try f[5].array().map { try bits($0) }).map { ($0, $1) }), at: f[5].path))
				return StyleNode(
					id: node.id, parent: node.parent, isText: node.isText, isAnonymous: node.isAnonymous,
					text: node.isText ? (relaidTexts[node.id] ?? node.text) : node.text,
					frame: Frame(x: frame[0], y: frame[1], width: frame[2], height: frame[3]),
					borderWidths: widths.map { ($0[0], $0[1], $0[2], $0[3]) }, writes: node.writes, borderOps: ops,
					scrollRange: range, lines: node.isText ? lines : nil)
			}
			var absolute: [String: (x: Double, y: Double)] = [:]
			for (index, node) in nodes.enumerated() {
				guard let frame = node.frame else { continue }
				var parent = (x: 0.0, y: 0.0)
				if let id = node.parent {
					guard let at = absolute[id] else { continue }
					parent = at
				}
				let at = (x: parent.x + frame.x, y: parent.y + frame.y)
				absolute[node.id] = at
				if let arrow = arrows.removeValue(forKey: node.id) {
					guard node.drawsSelectArrow else { throw PayloadError(path: "plan layout", reason: "Dragon's layout gives \(node.id) an arrow, but it draws none") }
					// Dragon snaps each edge from its absolute device px position, halves upward (Blink LayoutUnit::Round).
					nodes[index].selectArrow = SelectArrow(
						originX: (at.x + 0.5).rounded(.down) - at.x, originY: (at.y + 0.5).rounded(.down) - at.y,
						strokeWidth: arrow.strokeWidth, points: arrow.points)
				} else if node.drawsSelectArrow {
					throw PayloadError(path: "plan layout", reason: "\(node.id) draws a drop-down arrow, but Dragon's layout gives it no arrow geometry")
				}
				if let lines = areas.removeValue(forKey: node.id) { nodes[index].textAreaLines = lines }
				if let m = marks.removeValue(forKey: node.id) {
					guard node.drawsCheckbox else { throw PayloadError(path: "plan layout", reason: "Dragon's layout gives \(node.id) checkbox marks, but it draws no checkbox") }
					nodes[index].checkboxMarks = CheckboxMarks(
						originX: (at.x + 0.5).rounded(.down) - at.x, originY: (at.y + 0.5).rounded(.down) - at.y, x: m.x, y: m.y, side: m.side,
						plain: m.plain, radius: m.radius, backgroundInset: m.backgroundInset, borderInset: m.borderInset, borderWidth: m.borderWidth,
						check: m.check, checkWidth: m.checkWidth)
				} else if node.drawsCheckbox {
					throw PayloadError(path: "plan layout", reason: "\(node.id) draws a themed checkbox, but Dragon's layout gives it no marks")
				}
			}
			if let stray = arrows.keys.sorted().first {
				throw PayloadError(path: "plan layout", reason: "Dragon's layout gives an arrow for \(stray), which it shows no box for")
			}
			if let stray = marks.keys.sorted().first {
				throw PayloadError(path: "plan layout", reason: "Dragon's layout gives checkbox marks for \(stray), which it shows no box for")
			}
			let padding = StyleExport.runtimeImagePadding(assignment.nodes, dpr: dpr)
			nodes = try StyleExport.placingRuntimeImages(nodes, exported: false) { id in
				padding[id.firstIndex(of: "@").map { String(id[..<$0]) } ?? id].map { $0.map { $0 * scale } }
			}
			return (assignment.values, nodes, assignment.canvas, assignment.body)
		}
		out.pageScrolls = pages
		out.pageSticky = stickies
		if let undecided { out.pageScrollUndecided = undecided }
		out.viewport = (width, height)
		out.dpr = scale
		return out
	}

	/// Each runtime image's padding at the export's layout, in CSS px (top, right, bottom, left): its content box less its frame and
	/// borders. A phone lays the page out at its own size and keeps these, as px padding does not follow the layout.
	static func runtimeImagePadding(_ nodes: [StyleNode], dpr: Double) -> [String: [Double]] {
		var out: [String: [Double]] = [:]
		_ = try? placingRuntimeImages(nodes, exported: true) { _ in nil }.forEach { node in
			guard let place = node.runtimeImagePlace, let frame = node.frame else { return }
			let w = node.borderWidths ?? (0, 0, 0, 0)
			let left = place.content.x - place.originX - w.left, top = place.content.y - place.originY - w.top
			let right = frame.width - w.left - w.right - left - place.content.width
			let bottom = frame.height - w.top - w.bottom - top - place.content.height
			out[node.id] = [top, right, bottom, left].map { $0 / dpr }
		}
		return out
	}

	/// `nodes` with each framed runtime image placed: at the export's layout, its write's content box; at a phone's, its frame
	/// less its borders and the export's `padding` for it (device px, top, right, bottom, left).
	static func placingRuntimeImages(
		_ nodes: [StyleNode], exported: Bool, padding: (String) -> [Double]? = { _ in nil }
	) throws -> [StyleNode] {
		var absolute: [String: (x: Double, y: Double)] = [:]
		var out = nodes
		for (index, node) in nodes.enumerated() {
			guard let frame = node.frame else { continue }
			var parent = (x: 0.0, y: 0.0)
			if let id = node.parent {
				guard let at = absolute[id] else { continue }
				parent = at
			}
			let at = (x: parent.x + frame.x, y: parent.y + frame.y)
			absolute[node.id] = at
			guard let image = node.runtimeImage else { continue }
			let content: Frame
			if exported {
				guard let lu = image.content else { throw PayloadError(path: "style", reason: "\(node.id) draws an image its app loads, but the export gives it no content box") }
				let u = dragonLayoutUnitsPerPx
				content = Frame(x: lu.x / u, y: lu.y / u, width: lu.width / u, height: lu.height / u)
			} else {
				guard let p = padding(node.id) else { throw PayloadError(path: "plan layout", reason: "\(node.id) draws an image its app loads, but the export has no content box for it") }
				let w = node.borderWidths ?? (0, 0, 0, 0)
				let left = w.left + p[3], top = w.top + p[0]
				content = Frame(
					x: at.x + left, y: at.y + top, width: max(0, frame.width - left - w.right - p[1]), height: max(0, frame.height - top - w.bottom - p[2]))
			}
			out[index].runtimeImagePlace = RuntimeImagePlace(content: content, originX: at.x, originY: at.y)
		}
		return out
	}

	/// The node with one number of its `kind` write replaced: a colour channel the app computes, as Dragon's layout gives it.
	private static func patched(_ node: StyleNode, kind: String, path: Reader, value: Double) throws -> StyleNode {
		let steps = try path.array()
		let refused = PayloadError(path: "plan layout", reason: "Dragon's layout writes a slot into \(node.id)'s \(kind) at \(path.value.jsonText), which this host does not apply")
		func channel(_ color: RGBA, _ step: Reader) throws -> RGBA {
			guard step.isString else { throw refused }
			switch try step.string() {
			case "r": return RGBA(r: value, g: color.g, b: color.b, alpha: color.alpha)
			case "g": return RGBA(r: color.r, g: value, b: color.b, alpha: color.alpha)
			case "b": return RGBA(r: color.r, g: color.g, b: value, alpha: color.alpha)
			case "alpha": return RGBA(r: color.r, g: color.g, b: color.b, alpha: value)
			default: throw refused
			}
		}
		func named(_ step: Reader, _ name: String) -> Bool { step.isString && (try? step.string()) == name }
		var found = false
		let writes = try node.writes.map { write -> StyleWrite in
			switch (kind, write) {
			case let ("background-color", .backgroundColor(color)):
				guard steps.count == 2, named(steps[0], "color") else { throw refused }
				found = true
				return .backgroundColor(try channel(color, steps[1]))
			case let ("text-color", .textColor(color)):
				guard steps.count == 2, named(steps[0], "color") else { throw refused }
				found = true
				return .textColor(try channel(color, steps[1]))
			case let ("border-colors", .borderColors(colors)):
				guard steps.count == 3, named(steps[0], "colors"), case let .number(side) = steps[1].value, let index = colors.indices.first(where: { Double($0) == side }) else {
					throw refused
				}
				found = true
				var moved = colors
				moved[index] = try channel(colors[index], steps[2])
				return .borderColors(moved)
			default: return write
			}
		}
		guard found else { throw refused }
		return StyleNode(
			id: node.id, parent: node.parent, isText: node.isText, isAnonymous: node.isAnonymous, text: node.text, frame: node.frame,
			borderWidths: node.borderWidths, writes: writes, borderOps: node.borderOps, scrollRange: node.scrollRange, lines: node.lines)
	}

	/// A scroll range, or nil for JSON null.
	fileprivate static func decodeRange(_ reader: Reader) throws -> ScrollOffsetRange? {
		if reader.isNull { return nil }
		let r = try reader.object(["minX", "maxX", "minY", "maxY"])
		return ScrollOffsetRange(minX: try r["minX"].number(), maxX: try r["maxX"].number(), minY: try r["minY"].number(), maxY: try r["maxY"].number())
	}

	private static func decodeNode(_ node: Reader) throws -> StyleNode {
		let field = try node.object(required: ["id", "parent", "kind", "native", "text", "frame", "borderWidths", "writes"], optional: ["borderOps", "scrollRange", "lines"])
		let kind = try field["kind"].string()
		let native = try field["native"].string()
		var isText = false
		var isAnonymous = false
		switch (kind, native) {
		case ("element", "DragonBoxView"): break
		case ("text", "DragonTextView"): isText = true
		case ("anonymous", _): isAnonymous = true
		default: throw PayloadError(path: node.path, reason: "unknown node kind \(kind) with native view \(native)")
		}
		let frameReader = try field["frame"]
		let frame: Frame? = try frameReader.isNull ? nil : {
			let f = try frameReader.object(["x", "y", "width", "height"])
			return Frame(x: try f["x"].number(), y: try f["y"].number(), width: try f["width"].number(), height: try f["height"].number())
		}()
		let widthsReader = try field["borderWidths"]
		let borderWidths: (Double, Double, Double, Double)? = try widthsReader.isNull ? nil : {
			let w = try widthsReader.object(["top", "right", "bottom", "left"])
			return (try w["top"].number(), try w["right"].number(), try w["bottom"].number(), try w["left"].number())
		}()
		let textReader = try field["text"]
		let lines = field.has("lines") ? try decodeLines(try field["lines"]) : nil
		if lines != nil, !isText || frame == nil || textReader.isNull { throw node.fail("only a framed text node with a text has lines") }
		return StyleNode(
			id: try field["id"].string(), parent: try field["parent"].optionalString(), isText: isText, isAnonymous: isAnonymous,
			text: textReader.isNull ? nil : try textReader.string(), frame: frame, borderWidths: borderWidths,
			writes: try field["writes"].array().map(decodeWrite),
			borderOps: field.has("borderOps") ? try decodeBorderOps(try field["borderOps"]) : nil,
			scrollRange: field.has("scrollRange") ? try decodeRange(try field["scrollRange"]) : nil, lines: lines)
	}

	fileprivate static func decodeBorderOps(_ reader: Reader) throws -> BorderOps {
		let f = try reader.object(["origin", "size", "widths", "ops"])
		let origin = try f["origin"].object(["x", "y"])
		_ = try f["size"].object(["width", "height"])
		guard try f["widths"].array().count == 4 else { throw PayloadError(path: reader.path + ".widths", reason: "expected four sides") }
		let ops = try f["ops"].array().map { op -> BorderOps.Op in
			let o = try op.object(["op", "side", "alpha", "antialias", "points"])
			let kind = try o["op"].string()
			let points = try o["points"].array().map { try $0.number() }
			let side = Int(try o["side"].number())
			let shaped: Bool
			switch kind {
			case "begin-layer", "end-layer", "save", "restore": shaped = points.isEmpty
			case "clip": shaped = points.count >= 6 && points.count % 2 == 0
			case "fill": shaped = points.count >= 6 && points.count % 2 == 0 && (0...3).contains(side)
			case "dot": shaped = points.count == 3 && (0...3).contains(side)
			default: throw PayloadError(path: op.path, reason: "unknown border operation \(kind)")
			}
			guard shaped else { throw PayloadError(path: op.path, reason: "\(kind) has the wrong points or side") }
			return BorderOps.Op(op: kind, side: side, alpha: try o["alpha"].number(), antialias: try o["antialias"].bool(), points: points)
		}
		return BorderOps(originX: try origin["x"].number(), originY: try origin["y"].number(), ops: ops)
	}

	private static func decodeWrite(_ write: Reader) throws -> StyleWrite {
		let kind = try write.field("kind").string()
		let expectKey = { (fields: Fields, key: String) throws in
			let actual = try fields["key"].string()
			guard actual == key else { throw PayloadError(path: write.path + ".key", reason: "\(kind) write with key \(actual), expected \(key)") }
		}
		switch kind {
		case "background-color", "text-color":
			let f = try write.object(["kind", "color", "key"])
			try expectKey(f, kind == "background-color" ? "backgroundColor" : "foregroundColor")
			let color = try decodeColor(try f["color"])
			return kind == "background-color" ? .backgroundColor(color) : .textColor(color)
		case "border-widths":
			try expectKey(try write.object(["kind", "key"]), "dragonBorder.widths")
			return .borderWidths
		case "border-styles":
			let f = try write.object(["kind", "styles", "key"])
			try expectKey(f, "dragonBorder.styles")
			return .borderStyles(try sides(f["styles"]).map { try $0.string() })
		case "border-colors":
			let f = try write.object(["kind", "colors", "key"])
			try expectKey(f, "dragonBorder.colors")
			return .borderColors(try sides(f["colors"]).map(decodeColor))
		case "border-radius":
			let f = try write.object(["kind", "lengths", "key"])
			try expectKey(f, "dragonRadius.radiiPx")
			let lengths = try f["lengths"].array()
			guard lengths.count == 8 else { throw PayloadError(path: write.path, reason: "border-radius needs 8 lengths") }
			return .borderRadius(try lengths.map { length in
				let l = try length.object(["percent", "value"])
				return (percent: try l["percent"].bool(), value: try l["value"].number())
			})
		case "font":
			let f = try write.object(["kind", "font", "key"])
			try expectKey(f, "font")
			let font = try f["font"].object(["family", "size", "specifiedSize", "absoluteSize"])
			_ = try font["specifiedSize"].object(["kind", "value"])
			_ = try font["absoluteSize"].bool()
			return .font(family: try font["family"].string(), size: try font["size"].number())
		case "synthetic-bold":
			let f = try write.object(["kind", "keys", "values", "key"])
			try expectKey(f, "syntheticBold")
			_ = try f["keys"].array().map { try $0.number() }
			_ = try f["values"].array().map { try $0.number() }
			return .syntheticBold
		case "scroll-container":
			let f = try write.object(["kind", "x", "y", "key"])
			try expectKey(f, "dragonScroll.range")
			return .scrollContainer(x: try f["x"].bool(), y: try f["y"].bool())
		case "padding-box-clip":
			try expectKey(try write.object(["kind", "key"]), "dragonClip.frame")
			return .paddingBoxClip
		case "scroll-indicators-hidden":
			try expectKey(try write.object(["kind", "key"]), "dragonScroll.indicators")
			return .scrollIndicatorsHidden
		case "scroll-bounce":
			let f = try write.object(["kind", "bounceX", "bounceY", "key"])
			try expectKey(f, "dragonScroll.bounce")
			return .scrollBounce(x: try f["bounceX"].bool(), y: try f["bounceY"].bool())
		case "clip-path-inset":
			let f = try write.object(["kind", "edges", "key"])
			try expectKey(f, "dragonClipPath.frame")
			let edges = try sides(f["edges"]).map { edge in
				let e = try edge.object(["value", "unit"])
				let unit = try e["unit"].string()
				guard unit == "px" || unit == "%" else { throw PayloadError(path: edge.path + ".unit", reason: "clip-path inset unit \(unit) is not px or %") }
				return (value: try e["value"].number(), percent: unit == "%")
			}
			return .clipPathInset(edges)
		case "clip-text":
			let f = try write.object(["kind", "texts", "key"])
			try expectKey(f, "dragonClipText.exposed")
			_ = try f["texts"].array().map { try $0.string() }
			return .clipText
		case "paint-order":
			let f = try write.object(["kind", "host", "bucket", "rank", "index", "key"])
			try expectKey(f, "dragonStacking.order")
			_ = try f["index"].number()
			return .paintOrder(host: try f["host"].string(), bucket: Int(try f["bucket"].number()), rank: Int(try f["rank"].number()))
		case "box-shadow":
			let f = try write.object(["kind", "shadows", "key"])
			try expectKey(f, "dragonShadow.shadows")
			return .boxShadow(try f["shadows"].array().map { shadow in
				let s = try shadow.object(["inset", "x", "y", "blur", "spread", "color"])
				return BoxShadow.Shadow(
					inset: try s["inset"].bool(), x: try s["x"].number(), y: try s["y"].number(), blur: try s["blur"].number(),
					spread: try s["spread"].number(), color: try decodeColor(try s["color"]))
			})
		case "checkbox":
			let f = try write.object(["kind", "checked", "colors", "key"])
			try expectKey(f, "dragonCheckbox")
			// The initial checkedness; the runtime keeps the live one, which a tap changes and a re-render does not reset.
			_ = try f["checked"].bool()
			let colors = try f["colors"].object(["unchecked", "checked"])
			let off = try colors["unchecked"].object(["background", "border"])
			let on = try colors["checked"].object(["background", "fill", "check"])
			return .checkbox(CheckboxColors(
				uncheckedBackground: try decodeColor(off["background"]), uncheckedBorder: try decodeColor(off["border"]),
				checkedBackground: try decodeColor(on["background"]), fill: try decodeColor(on["fill"]), check: try decodeColor(on["check"])))
		case "visibility":
			let f = try write.object(["kind", "value", "canvas", "key"])
			try expectKey(f, "visibility")
			let value = try f["value"].string()
			guard ["visible", "hidden", "collapse"].contains(value) else { throw PayloadError(path: write.path + ".value", reason: "visibility \(value) is not visible, hidden or collapse") }
			_ = try f["canvas"].bool()
			return .visibility(value)
		case "runtime-image":
			let f = try write.object(["kind", "fit", "position", "layer", "pixelated", "absent", "key", "content"])
			try expectKey(f, "dragonRuntimeImage")
			let fit = try f["fit"].string()
			guard ["fill", "contain", "cover", "none", "scale-down"].contains(fit) else { throw PayloadError(path: write.path + ".fit", reason: "object-fit \(fit) is not a keyword Chrome has") }
			let axes = try f["position"].array()
			guard axes.count == 2 else { throw PayloadError(path: write.path + ".position", reason: "expected x and y") }
			let position = try axes.map { axis -> RuntimeImage.Position in
				let a = try axis.object(["kind", "value"])
				let kind = try a["kind"].string()
				guard kind == "px" || kind == "percent" else { throw PayloadError(path: axis.path + ".kind", reason: "\(kind) is not px or percent") }
				return RuntimeImage.Position(percent: kind == "percent", value: try a["value"].number())
			}
			_ = try f["layer"].bool()
			let absent = try f["absent"]
			var outline: RGBA?
			if !absent.isNull {
				let a = try absent.object(["color", "width"])
				guard try a["width"].number() == 1 else { throw PayloadError(path: absent.path + ".width", reason: "only a 1 device px no-image outline is drawn") }
				outline = try decodeColor(try a["color"])
			}
			let box = try f["content"]
			let content: Frame? = try box.isNull ? nil : {
				let c = try box.object(["x", "y", "width", "height"])
				return Frame(x: try c["x"].number(), y: try c["y"].number(), width: try c["width"].number(), height: try c["height"].number())
			}()
			return .runtimeImage(RuntimeImage(fit: fit, position: position, pixelated: try f["pixelated"].bool(), outline: outline, content: content))
		case "select-arrow":
			let f = try write.object(["kind", "color", "key"])
			try expectKey(f, "dragonSelectArrow")
			return .selectArrow(try decodeColor(try f["color"]))
		case "outline":
			let f = try write.object(["kind", "style", "width", "offset", "color", "tones", "radii", "layer", "key"])
			try expectKey(f, "dragonOutline.rings")
			let style = try f["style"].string()
			guard Outline.styles.contains(style) else { throw PayloadError(path: write.path + ".style", reason: "outline style \(style) has no native paint") }
			let width = try f["width"].number(), offset = try f["offset"].number()
			guard width > 0, width.isFinite, offset.isFinite else { throw PayloadError(path: write.path, reason: "outline width \(width) or offset \(offset) is out of range") }
			let threeD = ["groove", "ridge", "inset", "outset"].contains(style)
			var tones: (light: RGBA, dark: RGBA)?
			if try !f["tones"].isNull {
				let pair = try f["tones"].array()
				guard pair.count == 2 else { throw PayloadError(path: write.path + ".tones", reason: "expected a lighter and a darker colour") }
				tones = (try decodeColor(pair[0]), try decodeColor(pair[1]))
			}
			guard (tones != nil) == threeD else { throw PayloadError(path: write.path + ".tones", reason: "a \(style) outline \(threeD ? "needs" : "has no") lighter and darker colours") }
			var radii: [(percent: Bool, value: Double)]?
			if try !f["radii"].isNull {
				let lengths = try f["radii"].array()
				guard lengths.count == 8 else { throw PayloadError(path: write.path + ".radii", reason: "an outline's radii are 8 lengths") }
				radii = try lengths.map { length in
					let l = try length.object(["percent", "value"])
					return (percent: try l["percent"].bool(), value: try l["value"].number())
				}
			}
			return .outline(Outline(
				style: style, width: width, offset: offset, color: try decodeColor(try f["color"]), tones: tones, radii: radii,
				layer: try f["layer"].string()))
		case "transform":
			let f = try write.object(["kind", "ops", "origin", "key"])
			try expectKey(f, "dragonTransform")
			let functions = try f["ops"].array().map { op -> TransformFunction in
				let o = try op.object(["fn", "x", "y", "angle", "sx", "sy"])
				let fn = try o["fn"].string()
				guard transformFunctions.contains(fn) else { throw PayloadError(path: op.path + ".fn", reason: "transform function \"\(fn)\" is not one of \(transformFunctions)") }
				return TransformFunction(
					fn: fn, x: try decodeLength(try o["x"]), y: try decodeLength(try o["y"]), angle: try o["angle"].number(), sx: try o["sx"].number(),
					sy: try o["sy"].number())
			}
			let origin = try f["origin"].object(["x", "y"])
			return .transform(StyleTransform(functions: functions, originX: try decodeLength(try origin["x"]), originY: try decodeLength(try origin["y"])))
		case "opacity":
			let f = try write.object(["kind", "opacity", "key"])
			try expectKey(f, "alpha")
			let opacity = try f["opacity"].number()
			guard opacity >= 0, opacity < 1 else { throw PayloadError(path: write.path + ".opacity", reason: "opacity \(opacity) is not in [0, 1)") }
			return .opacity(opacity)
		case "opacity-group":
			let f = try write.object(required: ["kind", "opacity", "backdrop", "painters", "key"], optional: ["after", "unstable"])
			try expectKey(f, "dragonGroup")
			let opacity = try f["opacity"].number()
			guard opacity > 0, opacity < 1 else { throw PayloadError(path: write.path + ".opacity", reason: "opacity-group opacity \(opacity) is not in (0, 1)") }
			return .opacityGroup(OpacityGroup(
				opacity: opacity, backdrop: try f["backdrop"].optionalString(), painters: try f["painters"].array().map { try $0.string() },
				after: f.has("after") ? try f["after"].string() : nil, unstable: f.has("unstable") ? try f["unstable"].array().map { try $0.string() } : []))
		default:
			throw PayloadError(path: write.path + ".kind", reason: "unknown style write kind \"\(kind)\"")
		}
	}

	private static func decodeLength(_ reader: Reader) throws -> TransformLength {
		let l = try reader.object(["kind", "px", "percent"])
		let kind = try l["kind"].string()
		guard ["px", "percent", "calc"].contains(kind) else { throw PayloadError(path: reader.path + ".kind", reason: "transform length kind \"\(kind)\" is not px, percent or calc") }
		return TransformLength(kind: kind, px: try l["px"].number(), percent: try l["percent"].number())
	}

	private static func sides(_ reader: Reader) throws -> [Reader] {
		let items = try reader.array()
		guard items.count == 4 else { throw PayloadError(path: reader.path, reason: "expected 4 sides") }
		return items
	}

	private static func decodeColor(_ reader: Reader) throws -> RGBA {
		let c = try reader.object(["r", "g", "b", "alpha"])
		return RGBA(r: try c["r"].number(), g: try c["g"].number(), b: try c["b"].number(), alpha: try c["alpha"].number())
	}
}

/// A list whose rows a phone lays out (Dragon's `planRepeats`): the box its rows hang from and one row's top boxes, by Dragon id.
public struct PlanRepeat: Sendable, Equatable {
	public let id: String
	public let parent: String
	public let template: [String]
}

/// A row a page shows now: its key, the assignment its own states reach from the page's, and its texts by text node id.
public struct LaidOutRow: Sendable, Equatable {
	public let key: String
	public let assignment: Int
	public let texts: [String: String]
	/// The row's own values of the slots its template's style reads, by slot id.
	public var slots: [String: Double] = [:]

	public init(key: String, assignment: Int, texts: [String: String], slots: [String: Double] = [:]) {
		self.key = key
		self.assignment = assignment
		self.texts = texts
		self.slots = slots
	}
}

/// Dragon's translated paint of an img whose src the app sets as it runs (layout paint.ts runtimeImagePaint), when the host links
/// Dragon: from object-fit, object-position, the content box in absolute layout units, the image's size in CSS px and the zoom, the
/// destination rect, the snapped content box and the part of the destination drawn (nil: none), each in absolute device px.
public enum RuntimeImagePaint {
	nonisolated(unsafe) public static var engine:
		((_ fit: String, _ position: [RuntimeImage.Position], _ content: Frame, _ width: Double, _ height: Double, _ zoom: Double) throws -> (dest: Frame, content: Frame, drawn: Frame?))?

	/// Where an image `width` x `height` CSS px is drawn in `place`, at `scale` device px per point.
	public static func paint(
		_ image: RuntimeImage, at place: RuntimeImagePlace, width: Double, height: Double, scale: Double
	) throws -> (dest: Frame, content: Frame, drawn: Frame?) {
		guard let engine else { throw PayloadError(path: "style", reason: "an image the app loads is placed by Dragon's paint, which this host does not link") }
		let u = dragonLayoutUnitsPerPx
		let c = place.content
		return try engine(
			image.fit, image.position, Frame(x: (c.x * u).rounded(), y: (c.y * u).rounded(), width: (c.width * u).rounded(), height: (c.height * u).rounded()),
			width, height, scale)
	}
}

/// A textarea's line pitch, its first baseline below a line's top, and its padding (top, right, bottom, left), in device px.
public struct TextAreaLines: Equatable, Sendable {
	public let pitch: Double
	public let above: Double
	public let insets: [Double]
}

/// A sticky box of a laid-out assignment: its export id, and its row as Dragon's plan layout wrote it (with Dragon's own id).
public struct StickyRow: Equatable, Sendable {
	public let id: String
	public let row: JSONValue
}
