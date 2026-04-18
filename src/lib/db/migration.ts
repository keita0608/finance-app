/**
 * ストレージマイグレーション（Google Drive 版）
 *
 * Google Drive では IndexedDB / ファイルシステム間のマイグレーションは不要。
 * 既存の UI コンポーネントとの互換性維持のためにスタブを提供する。
 */

import type { Attachment } from '$lib/types';

export interface MigrationAttachment {
	journalId: string;
	attachmentId: string;
	attachment: Attachment;
	year: number;
}

export interface FolderMigrationItem {
	journalId: string;
	attachmentId: string;
	attachment: Attachment;
	year: number;
	currentPath: string;
	newPath: string;
}

export async function getAttachmentsForMigration(): Promise<MigrationAttachment[]> {
	return [];
}

export async function migrateAttachmentToFilesystem(): Promise<void> {}

export async function migrateAttachmentToIndexedDB(): Promise<void> {}

export async function getFilesystemAttachmentCount(): Promise<number> {
	return 0;
}

export async function getAttachmentsForFolderMigration(): Promise<FolderMigrationItem[]> {
	return [];
}

export async function migrateAttachmentToNewFolder(): Promise<void> {}
