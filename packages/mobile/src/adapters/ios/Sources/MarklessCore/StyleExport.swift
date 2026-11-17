import Foundation

public let dragonStyleExportSchemas = ["dragon.native-style-export/0", "dragon.native-style-export/1"]
private let dragonStyleExportUnits = "device px; frames relative to the parent box"

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
}

/// A style state of Dragon's export: the cell it follows (by key) and the values it can take.
public struct StyleState: Sendable {
	public let key: String
	public let domain: [NativeValue]

	/// The key names a payload cell when it is the cell's id or ends in `#<cell id>`.
	public func names(_ cell: String) -> Bool { key == cell || key.hasSuffix("#\(cell)") }
}

/// One target of a decoded `dragon.native-style-export/0` or `/1` file; `/0` reads as one assignment and no states.
public struct StyleExport: Sendable {
	public let fonts: [(id: String, file: String)]
	public let viewport: (width: Double, height: Double)
	public let dpr: Double
	public let states: [StyleState]
	public let initial: Int
	/// Every reachable combination of states, each a complete node list, with each state's value in it.
	public let assignments: [(values: [String: NativeValue], nodes: [StyleNode])]
	/// `next[a][s][v]`: the assignment reached from `a` by setting state `s` to its `v`-th value; -1 when unreachable.
	public let next: [[[Int]]]

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
		guard units == dragonStyleExportUnits else { throw PayloadError(path: "style.units", reason: "unsupported units \"\(units)\"") }
		let fonts = try fields["fonts"].array().map { font in
			let field = try font.object(["id", "file"])
			return (id: try field["id"].string(), file: try field["file"].string())
		}
		let chosen = try fields["targets"].field(target)
		// readiness is Dragon's verdict on its own device lanes; the proof does not depend on it, so it is read past.
		let targetFields = try chosen.object(
			required: perState ? ["backend", "viewport", "dpr", "states", "initial", "assignments", "next"] : ["backend", "viewport", "dpr", "nodes"],
			optional: ["readiness"])
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
		var assignments: [(values: [String: NativeValue], nodes: [StyleNode])]
		var next: [[[Int]]] = [[]]
		if perState {
			states = try targetFields["states"].array().map { state in
				let f = try state.object(["key", "domain"])
				return StyleState(key: try f["key"].string(), domain: try f["domain"].array().map { NativeValue(json: $0.value) })
			}
			assignments = try targetFields["assignments"].array().map { assignment in
				let f = try assignment.object(["values", "nodes"])
				let valuesReader = try f["values"]
				var values: [String: NativeValue] = [:]
				for key in try valuesReader.keys() { values[key] = NativeValue(json: try valuesReader.field(key).value) }
				guard Set(values.keys) == Set(states.map(\.key)) else { throw PayloadError(path: valuesReader.path, reason: "an assignment's values must name every state") }
				return (values, try checkedNodes(try f["nodes"]))
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
			assignments = [([:], try checkedNodes(try targetFields["nodes"]))]
		}
		return StyleExport(
			fonts: fonts, viewport: (try viewport["width"].number(), try viewport["height"].number()),
			dpr: try targetFields["dpr"].number(), states: states, initial: initial, assignments: assignments, next: next)
	}

	private static func decodeNode(_ node: Reader) throws -> StyleNode {
		let field = try node.object(["id", "parent", "kind", "native", "text", "frame", "borderWidths", "writes"])
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
			writes: try field["writes"].array().map(decodeWrite))
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
