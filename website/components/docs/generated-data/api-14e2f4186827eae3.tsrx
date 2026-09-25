import View from "../api-table-view.tsrx";
const data: Parameters<typeof View>[0]["painted"] = [{"id":"","name":"","headed":false,"empty":false,"rows":[{"name":"value","type":"string","label":"value: string","nameClass":"api-prop is-required","pieces":[{"text":"Required. ","id":"value:0","pieceClass":"api-text"},{"text":"This section's own name, and what the root's ","id":"value:1","pieceClass":"api-text"},{"text":"value","id":"value:2","pieceClass":"api-code"},{"text":" names.","id":"value:3","pieceClass":"api-text"}]},{"name":"disabled","type":"boolean","label":"disabled: boolean","nameClass":"api-prop","pieces":[{"text":"This one section opens and closes for nobody.","id":"disabled:0","pieceClass":"api-text"},{"text":" Default ","id":"disabled:1","pieceClass":"api-text"},{"text":"false","id":"disabled:2","pieceClass":"api-code"},{"text":".","id":"disabled:3","pieceClass":"api-text"}]}]}];
export default function PreparedDocs14e2f4186827eae3() @{
 <View painted={data} />;
}
