/**
 * /api/data/[table]/[id]
 *
 * GET    - 1件取得
 * PATCH  - 部分更新
 * DELETE - 削除
 *
 * accounts テーブルは id が code になる。
 * settings テーブルは id が key になる。
 */

import type { RequestHandler } from './$types';
import { readJsonFile, writeJsonFile } from '$lib/server/drive-client';
import { json, error } from '@sveltejs/kit';

const ALLOWED_TABLES = new Set([
	'accounts',
	'vendors',
	'journals',
	'settings',
	'fixed-assets',
	'invoices'
]);

function pkField(table: string): string {
	if (table === 'accounts') return 'code';
	if (table === 'settings') return 'key';
	return 'id';
}

export const GET: RequestHandler = async ({ params }) => {
	const { table, id } = params;
	if (!ALLOWED_TABLES.has(table)) throw error(400, `Unknown table: ${table}`);

	const records = (await readJsonFile<Record<string, unknown>[]>(`${table}.json`)) ?? [];
	const pk = pkField(table);
	const found = records.find((r) => r[pk] === id);
	if (!found) throw error(404, `${table}/${id} not found`);
	return json(found);
};

export const PATCH: RequestHandler = async ({ params, request }) => {
	const { table, id } = params;
	if (!ALLOWED_TABLES.has(table)) throw error(400, `Unknown table: ${table}`);

	const updates = await request.json();
	const fileName = `${table}.json`;
	const records = (await readJsonFile<Record<string, unknown>[]>(fileName)) ?? [];
	const pk = pkField(table);

	const idx = records.findIndex((r) => r[pk] === id);
	if (idx === -1) throw error(404, `${table}/${id} not found`);

	records[idx] = { ...records[idx], ...updates };
	await writeJsonFile(fileName, records);
	return json(records[idx]);
};

export const DELETE: RequestHandler = async ({ params }) => {
	const { table, id } = params;
	if (!ALLOWED_TABLES.has(table)) throw error(400, `Unknown table: ${table}`);

	const fileName = `${table}.json`;
	const records = (await readJsonFile<Record<string, unknown>[]>(fileName)) ?? [];
	const pk = pkField(table);

	const filtered = records.filter((r) => r[pk] !== id);
	await writeJsonFile(fileName, filtered);
	return json({ ok: true });
};
