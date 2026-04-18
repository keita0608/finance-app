/**
 * Google Drive API クライアント（サービスアカウント認証）
 *
 * 環境変数:
 *   GOOGLE_SERVICE_ACCOUNT_KEY  - サービスアカウントキー JSON 文字列
 *   GOOGLE_DRIVE_FOLDER_ID      - データ保存先の Google Drive フォルダ ID
 */

import { google } from 'googleapis';
import { env } from '$env/dynamic/private';
import { Readable } from 'node:stream';

function getDrive() {
	const keyJson = env.GOOGLE_SERVICE_ACCOUNT_KEY;
	if (!keyJson) throw new Error('GOOGLE_SERVICE_ACCOUNT_KEY が設定されていません');
	const credentials = JSON.parse(keyJson);
	const auth = new google.auth.GoogleAuth({ credentials, scopes: ['https://www.googleapis.com/auth/drive'] });
	return google.drive({ version: 'v3', auth });
}

function getRootFolderId(): string {
	const id = env.GOOGLE_DRIVE_FOLDER_ID;
	if (!id) throw new Error('GOOGLE_DRIVE_FOLDER_ID が設定されていません');
	return id;
}

async function findFile(name: string, folderId: string): Promise<string | null> {
	const drive = getDrive();
	const escaped = name.replace(/'/g, "\\'")
	const res = await drive.files.list({
		q: `name = '${escaped}' and '${folderId}' in parents and trashed = false`,
		fields: 'files(id)',
		spaces: 'drive'
	});
	return res.data.files?.[0]?.id ?? null;
}

async function ensureFolder(name: string, parentId: string): Promise<string> {
	const drive = getDrive();
	const escaped = name.replace(/'/g, "\\'")
	const res = await drive.files.list({
		q: `name = '${escaped}' and '${parentId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
		fields: 'files(id)',
		spaces: 'drive'
	});
	const existing = res.data.files?.[0]?.id;
	if (existing) return existing;
	const created = await drive.files.create({
		requestBody: { name, mimeType: 'application/vnd.google-apps.folder', parents: [parentId] },
		fields: 'id'
	});
	return created.data.id!;
}

export async function readJsonFile<T>(fileName: string): Promise<T | null> {
	const drive = getDrive();
	const folderId = getRootFolderId();
	const fileId = await findFile(fileName, folderId);
	if (!fileId) return null;
	const res = await drive.files.get({ fileId, alt: 'media' }, { responseType: 'stream' });
	const chunks: Buffer[] = [];
	await new Promise<void>((resolve, reject) => {
		(res.data as NodeJS.ReadableStream).on('data', (chunk: Buffer) => chunks.push(chunk));
		(res.data as NodeJS.ReadableStream).on('end', resolve);
		(res.data as NodeJS.ReadableStream).on('error', reject);
	});
	return JSON.parse(Buffer.concat(chunks).toString('utf-8')) as T;
}

export async function writeJsonFile<T>(fileName: string, data: T): Promise<void> {
	const drive = getDrive();
	const folderId = getRootFolderId();
	const content = JSON.stringify(data, null, 2);
	const media = { mimeType: 'application/json', body: Readable.from([content]) };
	const existingId = await findFile(fileName, folderId);
	if (existingId) {
		await drive.files.update({ fileId: existingId, media });
	} else {
		await drive.files.create({
			requestBody: { name: fileName, parents: [folderId], mimeType: 'application/json' },
			media,
			fields: 'id'
		});
	}
}

export async function uploadAttachment(fileName: string, year: number, content: Buffer, mimeType: string): Promise<string> {
	const drive = getDrive();
	const rootId = getRootFolderId();
	const evidencesId = await ensureFolder('evidences', rootId);
	const yearFolderId = await ensureFolder(String(year), evidencesId);
	const existingId = await findFile(fileName, yearFolderId);
	const media = { mimeType, body: Readable.from([content]) };
	if (existingId) {
		await drive.files.update({ fileId: existingId, media });
		return existingId;
	}
	const res = await drive.files.create({
		requestBody: { name: fileName, parents: [yearFolderId], mimeType },
		media,
		fields: 'id'
	});
	return res.data.id!;
}

export async function downloadAttachment(fileId: string): Promise<Buffer> {
	const drive = getDrive();
	const res = await drive.files.get({ fileId, alt: 'media' }, { responseType: 'arraybuffer' });
	return Buffer.from(res.data as ArrayBuffer);
}

export async function deleteFile(fileId: string): Promise<void> {
	const drive = getDrive();
	await drive.files.delete({ fileId });
}

export async function getFileMeta(fileId: string): Promise<{ name: string; mimeType: string }> {
	const drive = getDrive();
	const res = await drive.files.get({ fileId, fields: 'name,mimeType' });
	return { name: res.data.name!, mimeType: res.data.mimeType! };
}
