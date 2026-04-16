/**
 * POST /api/init
 *
 * アプリ初回起動時にデフォルト勘定科目を Google Drive に挿入する。
 * 既にデータがある場合はスキップする。
 */

import type { RequestHandler } from './$types';
import { readJsonFile, writeJsonFile } from '$lib/server/drive-client';
import { json } from '@sveltejs/kit';
import { defaultAccounts } from '$lib/db/seed';

export const POST: RequestHandler = async () => {
	const existing = await readJsonFile<unknown[]>('accounts.json');
	if (existing && existing.length > 0) {
		return json({ ok: true, initialized: false });
	}

	await writeJsonFile('accounts.json', defaultAccounts);
	console.log('[init] デフォルト勘定科目を挿入しました');
	return json({ ok: true, initialized: true });
};
