// A PDF document that belongs to this component; its fields are live. Show it with its element (see below).
export interface Pdf {
	// The page shown, counting from 1; assign to change it.
	page: number;
	// The page count; 0 until the file has loaded.
	readonly pages: number;
}
export declare function pdf(src: string): Pdf;
