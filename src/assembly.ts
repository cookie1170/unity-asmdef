import { PathLike } from "node:fs";
import { QuickPickItem } from "vscode";

export class Assembly implements QuickPickItem {
	label: string;
	description: string;
	path: PathLike;

	constructor(name: string, path: PathLike) {
		this.label = name;
		this.path = path;
		this.description =
			path.toString().includes("Packages") || path.toString().includes("Library") ? "Package" : "Project";
	}
}
