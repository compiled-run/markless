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
	/// Overflow other than visible: the children are clipped to the padding box.
	case paddingBoxClip
	/// clip-path: inset(): the box and everything in it are clipped to its border box inset by each edge (top, right, bottom, left).
	case clipPathInset([(value: Double, percent: Bool)])
	/// The text a clip-path leaves exposed to the screen reader; a clip does not change accessibility, so nothing to apply.
	case clipText
	/// The box paints in another stacking context's order (Dragon's re-hosting); `host` is that context's node.
	case paintOrder(host: String, bucket: Int, rank: Int)
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
	}
	public let originX: Double
	public let originY: Double
	public let ops: [Op]
}

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
}

/// A style state of Dragon's export: the cell it follows (by key) and the values it can take.
public struct StyleState: Sendable {
	public let key: String
	public let domain: [NativeValue]

	/// The key names a payload cell when it is the cell's id or ends in `#<cell id>`.
	public func names(_ cell: String) -> Bool { key == cell || key.hasSuffix("#\(cell)") }
}

public let nativeAppStyleVersion = "markless.native-app-style/0"

/// One media feature of a sheet's `@media` bands, as Dragon wrote it for the device to evaluate.
public struct StyleAtom: Sendable {
	public let feature: String
	public let comparisons: Int
	public let keyword: String
}

/// The `@media` bands of a page's styles: each band is the truth value of every atom; the state `@env#band` selects one.
public struct StyleBands: Sendable {
	public static let state = "@env#band"
	public let atoms: [StyleAtom]
	public let bands: [[Bool]]

	/// The band the device is in: only `prefers-color-scheme` is read on a phone so far; any other feature is refused.
	public func band(dark: Bool) throws -> Int {
		let truth = try atoms.map { atom -> Bool in
			guard atom.feature == "prefers-color-scheme", atom.comparisons == 0 else {
				throw PayloadError(path: "style.bands", reason: "the media feature \(atom.feature) is not evaluated on iOS yet")
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

/// One target of a decoded `dragon.native-style-export/0` or `/1` file; `/0` reads as one assignment and no states.
public struct StyleExport: Sendable {
	public let fonts: [(id: String, file: String)]
	public let viewport: (width: Double, height: Double)
	public let dpr: Double
	public let states: [StyleState]
	public let initial: Int
	/// Every reachable combination of states, each a complete node list, with each state's value in it.
	public let assignments: [(values: [String: NativeValue], nodes: [StyleNode], canvas: RGBA?, body: RGBA?)]
	/// `next[a][s][v]`: the assignment reached from `a` by setting state `s` to its `v`-th value; -1 when unreachable.
	public let next: [[[Int]]]
	/// Why Dragon does not call this target shipping output yet; nil when it is `ready`.
	public let notReady: String?
	/// Only for a sheet with `@media`: its bands, selected by the state `@env#band`.
	public let bands: StyleBands?

	/// Reads the target this host renders, by Dragon target name (`ios`) and the backend it must have been lowered for.
	public static func decode(_ data: Data, target: String = "ios", backend: String = "uikit") throws -> StyleExport {
		let root = try Reader(JSONValue.parse(data), at: "style")
		let fields = try root.object(required: ["schema", "units", "fonts", "targets"], optional: ["compiler", "component", "source", "warnings"])
		let schema = try fields["schema"].string()
		guard dragonStyleExportSchemas.contains(schema) else {
			throw PayloadError(path: "style.schema", reason: "unsupported schema \"\(schema)\", this host reads \(dragonStyleExportSchemas)")
		}
		let perState = schema == dragonStyleExportSchemas[1]
		let units = try fields["units"].string()
		guard dragonStyleExportUnits.contains(units) else { throw PayloadError(path: "style.units", reason: "unsupported units \"\(units)\"") }
		return try decodeTarget(try fields["targets"].field(target), perState: perState, fonts: try decodeFonts(fields["fonts"]), backend: backend)
	}

	/// Reads an app's `markless.native-app-style/0` for one target: each styled route's styles, by route pattern.
	public static func decodeApp(_ data: Data, target: String = "ios", backend: String = "uikit") throws -> [String: StyleExport] {
		let root = try Reader(JSONValue.parse(data), at: "style")
		let fields = try root.object(["version", "units", "warnings", "fonts", "targets"])
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
		let targetFields = try chosen.object(["backend", "viewport", "dpr", "writes", "routes"])
		let writes = try targetFields["writes"].array().map { list in _ = try list.array(); return list.value }
		var routes: [String: StyleExport] = [:]
		for route in try targetFields["routes"].array() {
			let f = try route.object(
				required: ["pattern", "component", "compiler", "readiness", "states", "initial", "next", "assignments"], optional: ["bands"])
			let pattern = try f["pattern"].string()
			_ = (try f["component"].string(), try f["compiler"].string())
			let assignments: [JSONValue] = try f["assignments"].array().map { assignment in
				let a = try assignment.object(required: ["values", "nodes", "canvas"], optional: ["bodyBackground"])
				let nodes: [JSONValue] = try a["nodes"].array().map { node in
					guard case let .object(entries) = node.value else { throw node.fail("expected an object") }
					let index = Int(try node.field("writes").number())
					guard writes.indices.contains(index) else { throw node.fail("writes \(index) is not in the target's writes") }
					return .object(entries.map { $0.0 == "writes" ? ("writes", writes[index]) : $0 })
				}
				let body: [(String, JSONValue)] = a.has("bodyBackground") ? [("bodyBackground", try a["bodyBackground"].value)] : []
				return .object([("values", try a["values"].value), ("nodes", .array(nodes)), ("canvas", try a["canvas"].value)] + body)
			}
			let raw = { (fields: Fields, key: String) throws -> (String, JSONValue) in (key, try fields[key].value) }
			var page: [(String, JSONValue)] = [
				try raw(targetFields, "backend"), try raw(targetFields, "viewport"), try raw(targetFields, "dpr"),
				try raw(f, "readiness"), try raw(f, "states"), try raw(f, "initial"), ("assignments", .array(assignments)), try raw(f, "next"),
			]
			if f.has("bands") { page.append(("bands", try f["bands"].value)) }
			guard routes[pattern] == nil else { throw route.fail("route \(pattern) is listed twice") }
			routes[pattern] = try decodeTarget(try Reader(.object(page), at: route.path), perState: true, fonts: fonts, backend: backend)
		}
		return routes
	}

	private static func decodeFonts(_ reader: Reader) throws -> [(id: String, file: String)] {
		try reader.array().map { font in
			let field = try font.object(["id", "file"])
			return (id: try field["id"].string(), file: try field["file"].string())
		}
	}

	private static func decodeTarget(_ chosen: Reader, perState: Bool, fonts: [(id: String, file: String)], backend: String) throws -> StyleExport {
		let targetFields = try chosen.object(
			required: perState ? ["backend", "viewport", "dpr", "states", "initial", "assignments", "next"] : ["backend", "viewport", "dpr", "nodes"],
			optional: perState ? ["readiness", "bands"] : [])
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
		if perState {
			states = try targetFields["states"].array().map { state in
				let f = try state.object(["key", "domain"])
				return StyleState(key: try f["key"].string(), domain: try f["domain"].array().map { NativeValue(json: $0.value) })
			}
			assignments = try targetFields["assignments"].array().map { assignment in
				let f = try assignment.object(required: ["values", "nodes"], optional: ["canvas", "bodyBackground"])
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
				return (values, try checkedNodes(try f["nodes"]), canvas, body)
			}
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
		} else {
			assignments = [([:], try checkedNodes(try targetFields["nodes"]), nil, nil)]
		}
		var bands: StyleBands?
		if targetFields.has("bands") {
			let reader = try targetFields["bands"]
			let b = try reader.object(["atoms", "bands", "conditions"])
			let atoms = try b["atoms"].array().map { atom in
				let a = try atom.object(["feature", "comparisons", "keyword"])
				return StyleAtom(feature: try a["feature"].string(), comparisons: try a["comparisons"].array().count, keyword: try a["keyword"].string())
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
		return StyleExport(
			fonts: fonts, viewport: (try viewport["width"].number(), try viewport["height"].number()),
			dpr: try targetFields["dpr"].number(), states: states, initial: initial, assignments: assignments, next: next, notReady: notReady,
			bands: bands)
	}

	private static func decodeNode(_ node: Reader) throws -> StyleNode {
		let field = try node.object(required: ["id", "parent", "kind", "native", "text", "frame", "borderWidths", "writes"], optional: ["borderOps"])
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
		return StyleNode(
			id: try field["id"].string(), parent: try field["parent"].optionalString(), isText: isText, isAnonymous: isAnonymous,
			text: textReader.isNull ? nil : try textReader.string(), frame: frame, borderWidths: borderWidths,
			writes: try field["writes"].array().map(decodeWrite),
			borderOps: field.has("borderOps") ? try decodeBorderOps(try field["borderOps"]) : nil)
	}

	private static func decodeBorderOps(_ reader: Reader) throws -> BorderOps {
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
		case "padding-box-clip":
			try expectKey(try write.object(["kind", "key"]), "dragonClip.frame")
			return .paddingBoxClip
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
		default:
			throw PayloadError(path: write.path + ".kind", reason: "unknown style write kind \"\(kind)\"")
		}
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
