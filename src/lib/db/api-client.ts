/**
 * クライアントサイド API ヘルパー
 *
 * サーバーサイドの /api/data/* および /api/attachments/* エンドポイントを
 * 呼び出すための薄いラッパー。すべてのリポジトリ関数はこのモジュールを使用する。
 */

const DATA_BASE = '/api/data';
const ATTACHMENT_BASE = '/api/attachments';

async function handleResponse(res: Response): Promise<unknown> {
	if (!res.ok) {
		const text = await res.text().catch(() => res.statusText);
		throw new Error(`API error ${res.status}: ${text}`);
	}
	return res.json();
}

export async function listRecords<T>(table: string, params?: Record<string, string>): Promise<T[]> {
	const url = new URL(DATA_BASE + '/' + table, location.origin);
	if (params) {
		for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
	}
	return handleResponse(await fetch(url.toString())) as Promise<T[]>;
}

export async function getRecord<T>(table: string, id: string, params?: Record<string, string>): Promise<T | undefined> {
	const url = new URL(`${DATA_BASE}/${table}/${encodeURIComponent(id)}`, location.origin);
	if (params) {
		for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
	}
	const res = await fetch(url.toString());
	if (res.status === 404) return undefined;
	return handleResponse(res) as Promise<T>;
}

export async function createRecord<T>(table: string, data: T): Promise<void> {
	await handleResponse(await fetch(`${DATA_BASE}/${table}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }));
}

export async function updateRecord(table: string, id: string, updates: Record<string, unknown>, params?: Record<string, string>): Promise<void> {
	const url = new URL(`${DATA_BASE}/${table}/${encodeURIComponent(id)}`, location.origin);
	if (params) {
		for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
	}
	await handleResponse(await fetch(url.toString(), { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(updates) }));
}

export async function deleteRecord(table: string, id: string, params?: Record<string, string>): Promise<void> {
	const url = new URL(`${DATA_BASE}/${table}/${encodeURIComponent(id)}`, location.origin);
	if (params) {
		for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
	}
	await handleResponse(await fetch(url.toString(), { method: 'DELETE' }));
}

export async function uploadAttachment(file: File, year: number, name: string): Promise<string> {
	const form = new FormData();
	form.append('file', file);
	form.append('year', String(year));
	form.append('name', name);
	const res = await fetch(ATTACHMENT_BASE, { method: 'POST', body: form });
	const data = (await handleResponse(res)) as { fileId: string };
	return data.fileId;
}

export async function downloadAttachment(fileId: string): Promise<Blob> {
	const res = await fetch(`${ATTACHMENT_BASE}/${encodeURIComponent(fileId)}`);
	if (!res.ok) throw new Error(`添付ファイルの取得に失敗しました: ${res.status}`);
	return res.blob();
}

export async function deleteAttachment(fileId: string): Promise<void> {
	const res = await fetch(`${ATTACHMENT_BASE}/${encodeURIComponent(fileId)}`, { method: 'DELETE' });
	if (!res.ok) throw new Error(`添付ファイルの削除に失敗しました: ${res.status}`);
}
