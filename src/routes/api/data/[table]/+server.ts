/**
 * /api/data/[table]
 *
 * GET  - テーブル全件取得（journals は ?year=YYYY でフィルタ可能）
 * POST - レコード追加
 */

import type { RequestHandler } from './$types';
import { readJsonFile, writeJsonFile } from '$lib/server/drive-client';
import { json, error } from '@sveltejs/kit';

// 許可されたテーブル名
const ALLOWED_TABLES = new Set([
	'accounts',
	'vendors',
	'journals',
	'settings',
	'fixed-assets',
	'invoices'
]);

function tableFileName(table: string): string {
	return `${table}.json`;
}

export const GET: RequestHandler = async ({ params, url }) => {
	const { table } = params;
	if (!ALLOWED_TABLES.has(table)) throw error(400, `Unknown table: ${table}`);

	const year = url.searchParams.get('year') ?? undefined;
	const fileName = tableFileName(table);
	let data = (await readJsonFile<Record<string, unknown>[]>(fileName)) ?? [];

	// journals は year パラメータがある場合にサーバーサイドでフィルタ
	if (table === 'journals' && year) {
		const startDate = `${year}-01-01`;
		const endDate = `${year}-12-31`;
		data = data.filter((j) => {
			const d = j['date'] as string;
			return d >= startDate && d <= endDate;
		});
	}

	return json(data);
};

/** DELETE /api/data/[table] — テーブル全件削除（クリア） */
export const DELETE: RequestHandler = async ({ params }) => {
	const { table } = params;
	if (!ALLOWED_TABLES.has(table)) throw error(400, `Unknown table: ${table}`);
	await writeJsonFile(`${table}.json`, []);
	return json({ ok: true });
};

export const POST: RequestHandler = async ({ params, request }) => {
	const { table } = params;
	if (!ALLOWED_TABLES.has(table)) throw error(400, `Unknown table: ${table}`);

	const record = await request.json();
	const fileName = tableFileName(table);
	const existing = (await readJsonFile<unknown[]>(fileName)) ?? [];

	// settings テーブルはキーバリュー形式（キーで upsert）
	if (table === 'settings') {
		const key = (record as { key: string }).key;
		const updated = (existing as { key: string }[]).filter((r) => r.key !== key);
		updated.push(record);
		await writeJsonFile(fileName, updated);
		return json({ ok: true });
	}

	existing.push(record);
	await writeJsonFile(fileName, existing);
	return json({ ok: true });
};
