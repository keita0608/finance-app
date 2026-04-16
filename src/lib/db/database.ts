/**
 * データベース初期化モジュール（Google Drive 版）
 *
 * 旧 Dexie / IndexedDB の代わりに Google Drive をバックエンドとして使用する。
 * `initializeDatabase()` はアプリ起動時にサーバーへ初期化リクエストを送り、
 * デフォルト勘定科目が存在しない場合は挿入する。
 */

import type { SettingsKey, SettingsValueMap } from '$lib/types';

/**
 * 設定レコード（キーバリュー形式）
 */
export type SettingsRecord = {
	[K in SettingsKey]: {
		key: K;
		value: SettingsValueMap[K];
		updatedAt: string;
	};
}[SettingsKey];

/**
 * データベースの初期化
 * 初回起動時にデフォルト勘定科目が存在しなければサーバー側で挿入する。
 */
export async function initializeDatabase(): Promise<void> {
	const res = await fetch('/api/init', { method: 'POST' });
	if (!res.ok) {
		console.warn('[db] 初期化リクエストが失敗しました:', res.status);
	}
}
