import * as vscode from "vscode";
import { Assembly } from "./assembly";
import fg from "fast-glob";
import { readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";

let asmChoices: Assembly[];

async function readAssemblies(): Promise<Assembly[]> {
	const currentDir = vscode.workspace.workspaceFolders ? vscode.workspace.workspaceFolders[0] : undefined;

	if (currentDir === undefined) {
		return [];
	}

	let result: Assembly[] = [];

	const assemblies = await fg(`${currentDir.uri.path}/**/*.asmdef`);
	for (const asm of assemblies) {
		const assembly = await getAssemblyFromPath(asm);

		result.push(assembly);
	}
	return result;
}

async function addReferenceToAssembly(targetAssembly: Assembly, chosenAssembly: Assembly) {
	let { asmObject, isGuid } = await getAsmObject(targetAssembly);

	const guid = await getGuidForAssembly(chosenAssembly);
	if (guid === undefined) {
		throw error(`Couldn't find a GUID for assembly ${chosenAssembly.label}`);
	}

	const refString: string = isGuid ? `GUID:${guid}` : chosenAssembly.label;

	asmObject["references"].push(refString);

	await writeFile(targetAssembly.path, JSON.stringify(asmObject, null, 4));
}

async function getAsmObject(asm: Assembly) {
	const asmObject = JSON.parse(removeBomFromString(await readFile(asm.path, { encoding: "utf8" })));

	let isGuid = false;

	if (asmObject["references"] === undefined) {
		asmObject["references"] = [];
	} else if (asmObject["references"].length > 0 && asmObject["references"][0].startsWith("GUID")) {
		isGuid = true;
	}
	return { asmObject, isGuid };
}

async function referenceAssembly() {
	if (asmChoices === undefined || asmChoices.length === 0) {
		await updateAssemblies();
	}

	if (asmChoices === undefined) {
		throw error("No assemblies found in project!");
	}

	const editor = vscode.window.activeTextEditor;

	if (editor === undefined) {
		throw error("No file open!");
	}

	const currentFileAssembly = await findAssemblyForFile(editor.document.uri);

	if (currentFileAssembly === undefined) {
		throw error("Couldn't find assembly for open file!");
	}

	let choices: Assembly[] = [];
	const { asmObject, isGuid } = await getAsmObject(currentFileAssembly);

	for (const asm of asmChoices) {
		if (asm.path === currentFileAssembly.path) {
			continue;
		}

		const guid = await getGuidForAssembly(asm);

		if (guid === undefined) {
			continue;
		}

		let refString = isGuid ? `GUID:${guid}` : asm.label;
		if (asmObject["references"] !== undefined && asmObject["references"].includes(refString)) {
			continue;
		}

		choices.push(asm);
	}

	const chosenAssembly = await vscode.window.showQuickPick(choices, {
		placeHolder: "Assembly name (type to search)",
	});

	if (chosenAssembly === undefined) {
		return;
	}

	await addReferenceToAssembly(currentFileAssembly, chosenAssembly);
	vscode.window.showInformationMessage(
		`Succesfully added a reference for '${chosenAssembly.label}' to '${currentFileAssembly.label}'`,
	);
}

async function findAssemblyForFile(file: vscode.Uri): Promise<Assembly | undefined> {
	let path = file.path;
	let asmdef: Assembly | undefined = undefined;

	while (path.length > 0 && asmdef === undefined) {
		path = path.substring(0, path.lastIndexOf("/"));
		const asmFiles = await fg(`${path}/*.asmdef`);

		if (asmFiles === undefined || asmFiles.length <= 0) {
			continue;
		}

		asmdef = await getAssemblyFromPath(asmFiles[0]);
	}

	return asmdef;
}

export async function activate(context: vscode.ExtensionContext) {
	const referenceAssemblyDisposable = vscode.commands.registerCommand(
		"unity-asmdef.referenceAssembly",
		referenceAssembly,
	);

	const updateAssembliesDisposable = vscode.commands.registerCommand("unity-asmdef.updateAssemblies", () => {
		vscode.window.withProgress(
			{
				location: vscode.ProgressLocation.Window,
				title: "Updating assemblies",
			},
			updateAssemblies,
		);
	});

	context.subscriptions.push(referenceAssemblyDisposable, updateAssembliesDisposable);

	await updateAssemblies();
}

async function updateAssemblies() {
	asmChoices = await readAssemblies();
}

async function getAssemblyFromPath(asm: string): Promise<Assembly> {
	const contents = removeBomFromString(await readFile(asm, { encoding: "utf8" }));

	try {
		const json = JSON.parse(contents);
		const name = json.name;

		if (name === undefined) {
			throw new Error("No 'name' key found");
		}

		return new Assembly(name, asm);
	} catch (err) {
		const asmName = asm.substring(asm.lastIndexOf("/") + 1);
		throw error(`Error parsing assembly ${asmName}: ${err}`);
	}
}

// for SOME reason some assemblies are encoded using the outdated UTF-8 with BOM encoding,
// which has the bytes 0xEF, 0xBB and 0xBF at the start of the string which is \ufeff for utf8
function removeBomFromString(contents: string): string {
	if (contents.startsWith("\ufeff")) {
		contents = contents.substring(1);
	}

	return contents;
}

async function getGuidForAssembly(asm: Assembly): Promise<string | undefined> {
	const metaPath = `${asm.path}.meta`;

	if (!existsSync(metaPath)) {
		return undefined;
	}

	const metaFile = await readFile(metaPath, { encoding: "utf8" });
	for (const line of metaFile.split("\n")) {
		if (/guid: .+/.exec(line)) {
			return line.split(": ")[1];
		}
	}

	return undefined;
}

function error(message: string): Error {
	vscode.window.showErrorMessage(message);
	return new Error(message);
}
