/**
 * File System Access API ユーティリティ
 * デスクトップ向けのファイルシステム操作
 */

interface FileSystemPermissionDescriptor {
	mode: 'read' | 'readwrite';
}

interface ExtendedFileSystemDirectoryHandle extends FileSystemDirectoryHandle {
	queryPermission(descriptor: FileSystemPermissionDescriptor): Promise<PermissionState>;
	requestPermission(descriptor: FileSystemPermissionDescriptor): Promise<PermissionState>;
}

export function supportsFileSystemAccess(): boolean {
	return typeof window !== 'undefined' && 'showDirectoryPicker' in window;
}

export async function pickDirectory(): Promise<FileSystemDirectoryHandle | null> {
	if (!supportsFileSystemAccess()) return null;
	try {
		// @ts-expect-error - File System Access API
		const handle = await window.showDirectoryPicker({ mode: 'readwrite', startIn: 'documents' });
		return handle;
	} catch (error) {
		if (error instanceof Error && error.name === 'AbortError') return null;
		throw error;
	}
}

/**
 * Google Drive 版ではディレクトリハンドルを使用しない。
 * 互換性維持のために null を返す。
 */
export async function getSavedDirectoryHandle(): Promise<FileSystemDirectoryHandle | null> {
	return null;
}

export async function saveDirectoryHandle(_handle: FileSystemDirectoryHandle): Promise<void> {
	// Google Drive 版では不要
}

export async function clearDirectoryHandle(): Promise<void> {
	// Google Drive 版では不要
}

export async function getYearDirectory(rootHandle: FileSystemDirectoryHandle, year: number): Promise<FileSystemDirectoryHandle> {
	return await rootHandle.getDirectoryHandle(String(year), { create: true });
}

export async function fileExistsInDirectory(rootHandle: FileSystemDirectoryHandle, year: number, fileName: string): Promise<boolean> {
	try {
		const yearDir = await rootHandle.getDirectoryHandle(String(year));
		await yearDir.getFileHandle(fileName);
		return true;
	} catch {
		return false;
	}
}

export async function saveFileToDirectory(rootHandle: FileSystemDirectoryHandle, year: number, fileName: string, file: File | Blob): Promise<string> {
	const yearDir = await getYearDirectory(rootHandle, year);
	const fileHandle = await yearDir.getFileHandle(fileName, { create: true });
	const writable = await fileHandle.createWritable();
	await writable.write(file);
	await writable.close();
	return `${year}/${fileName}`;
}

export async function readFileFromDirectory(rootHandle: FileSystemDirectoryHandle, filePath: string): Promise<Blob | null> {
	try {
		const [year, ...parts] = filePath.split('/');
		const yearDir = await rootHandle.getDirectoryHandle(year);
		const fileHandle = await yearDir.getFileHandle(parts.join('/'));
		return await fileHandle.getFile();
	} catch {
		return null;
	}
}

export async function deleteFileFromDirectory(rootHandle: FileSystemDirectoryHandle, filePath: string): Promise<void> {
	try {
		const [year, ...parts] = filePath.split('/');
		const yearDir = await rootHandle.getDirectoryHandle(year);
		await yearDir.removeEntry(parts.join('/'));
	} catch {
		// ファイルが存在しない場合は無視
	}
}

export function getDirectoryDisplayName(handle: FileSystemDirectoryHandle): string {
	return handle.name;
}

export async function renameFileInDirectory(rootHandle: FileSystemDirectoryHandle, oldFilePath: string, newFileName: string): Promise<string> {
	const [year, ...parts] = oldFilePath.split('/');
	const oldFileName = parts.join('/');
	if (oldFileName === newFileName) return oldFilePath;
	const yearDir = await rootHandle.getDirectoryHandle(year);
	const oldFileHandle = await yearDir.getFileHandle(oldFileName);
	const oldData = await (await oldFileHandle.getFile()).arrayBuffer();
	const newFileHandle = await yearDir.getFileHandle(newFileName, { create: true });
	const writable = await newFileHandle.createWritable();
	await writable.write(oldData);
	await writable.close();
	await yearDir.removeEntry(oldFileName);
	return `${year}/${newFileName}`;
}
