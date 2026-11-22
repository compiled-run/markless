import Foundation
@testable import MarklessCore
import Testing

private let slotPayload = """
	{"version":"markless.native-view/0","component":"S","cells":[{"id":"state:n","name":"n","initial":0}],
	"slots":[{"id":"slot:0","value":{"cell":"state:n"},"integer":true}],
	"nodes":[{"kind":"element","id":"h0","element":"button","parent":null,"style":["background-color: rgb(",{"slot":"slot:0"},", 0, 0)"]}],
	"events":[{"host":"h0","event":"activate","handler":"handler:0"}],
	"handlers":[{"id":"handler:0","ops":[{"op":"assign","cell":"state:n","value":{"binary":"+","left":{"cell":"state:n"},"right":{"literal":5}}}]}]}
	"""

@Test func aSlotWhoseValueChangesIsJournalled() throws {
	let runtime = NativeRuntime(payload: try NativeViewPayload.decode(Data(slotPayload.utf8)))
	#expect(try runtime.slots().map(\.value) == [0])
	#expect(try runtime.dispatch(NativeAction(event: .activate, host: "h0")) == [.slot(slot: "slot:0", value: 5)])
	#expect(try runtime.slots().map(\.slot) == ["slot:0"])
	#expect(NativeJournalEntry.slot(slot: "slot:0", value: 5).json.jsonText == #"{"op":"slot","slot":"slot:0","value":5}"#)
}

@Test func aStyleHoleMustNameAPayloadSlot() {
	let unknown = slotPayload.replacingOccurrences(of: #"{"slot":"slot:0"}"#, with: #"{"slot":"slot:9"}"#)
	#expect(throws: PayloadError.self) { try NativeViewPayload.decode(Data(unknown.utf8)) }
}

private let slotExport = Data("""
	{"schema":"dragon.native-style-export/1","units":"frames and borderWidths in device px, frames relative to the parent box; lengths inside writes in CSS px",
	"fonts":[],"slots":[{"id":"slot:0","initial":0,"integer":true}],
	"targets":{"ios":{"backend":"uikit","viewport":{"width":100,"height":100},"dpr":1,"states":[],"initial":0,"next":[[]],
	"plan":{"version":"dragon.markless-plan/1"},
	"assignments":[{"values":{},"nodes":[{"id":"h0","parent":null,"kind":"element","native":"DragonBoxView","text":null,
	"frame":{"x":0,"y":0,"width":10,"height":10},"borderWidths":null,
	"writes":[{"kind":"background-color","color":{"r":0,"g":0,"b":0,"alpha":255},"key":"backgroundColor"}]}]}]}}}
	""".utf8)

private func hex(_ value: Double) -> String {
	let digits = String(value.bitPattern, radix: 16)
	return "\"" + String(repeating: "0", count: 16 - digits.count) + digits + "\""
}

@Test func laidOutPatchesTheColourASlotMoves() throws {
	let style = try StyleExport.decode(slotExport)
	#expect(style.slots == [StyleSlot(id: "slot:0", initial: 0, integer: true)])
	var sent: [String] = []
	let relaid = try style.laidOut(width: 100, height: 100, scale: 1, slots: [5]) { line in
		sent.append(line)
		let frame = [0, 0, 10, 10].map { hex(Double($0)) }.joined(separator: ",")
		return "[\"ok\",[\(hex(0)),\(hex(0)),\(hex(0)),\(hex(0))],[[\"h0\",[\(frame)],null,null,null,null]],[[\"h0\",\"background-color\",[\"color\",\"r\"],\(hex(5))]]]"
	}
	#expect(sent.count == 1 && sent[0].hasSuffix(",\"slots\":[\(hex(5))]}"))
	guard case let .backgroundColor(color)? = relaid.assignments[0].nodes[0].writes.first else {
		Issue.record("no background-color write")
		return
	}
	#expect(color == RGBA(r: 5, g: 0, b: 0, alpha: 255))
}

@Test func laidOutRefusesAPathItDoesNotApply() throws {
	let style = try StyleExport.decode(slotExport)
	#expect(throws: PayloadError.self) {
		try style.laidOut(width: 100, height: 100, scale: 1, slots: [5]) { _ in
			let frame = [0, 0, 10, 10].map { hex(Double($0)) }.joined(separator: ",")
			return "[\"ok\",[\(hex(0)),\(hex(0)),\(hex(0)),\(hex(0))],[[\"h0\",[\(frame)],null,null,null,null]],[[\"h0\",\"background-color\",[\"color\",\"hue\"],\(hex(5))]]]"
		}
	}
}

@Test func laidOutKeepsDragonsReasonWhenItLeavesThePageRangeUndecided() throws {
	let style = try StyleExport.decode(slotExport)
	let relaid = try style.laidOut(width: 100, height: 100, scale: 1, slots: [5]) { _ in
		let frame = [0, 0, 10, 10].map { hex(Double($0)) }.joined(separator: ",")
		return "[\"ok\",[\"undecided\",\"m3\",\"an overflow clip on a box the page scrolls\"],[[\"h0\",[\(frame)],null,null,null,null]],[]]"
	}
	#expect(relaid.pageScrolls == [nil])
	#expect(relaid.pageScrollUndecided == "m3: an overflow clip on a box the page scrolls")
}
