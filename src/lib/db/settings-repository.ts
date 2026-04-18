import type { Attachment, SettingsKey, SettingsValueMap, StorageType } from '$lib/types';
import { listRecords, createRecord } from './api-client';

type SettingsEntry = { key: string; value: unknown; updatedAt: string };

async function getAllSettings(): Promise<SettingsEntry[]> {
	return listRecords<SettingsEntry>('settings');
}

export async function getSetting<K extends SettingsKey>(key: K): Promise<SettingsValueMap[K] | undefined> {
	const records = await getAllSettings();
	const found = records.find((r) => r.key === key);
	return found ? (found.value as SettingsValueMap[K]) : undefined;
}

export async function setSetting<K extends SettingsKey>(key: K, value: SettingsValueMap[K]): Promise<void> {
	await createRecord('settings', { key, value: JSON.parse(JSON.stringify(value)), updatedAt: new Date().toISOString() });
}

export async function getStorageMode(): Promise<StorageType> { return 'googledrive'; }
export async function setStorageMode(_mode: StorageType): Promise<void> {}
export async function getStorageModeForYear(_year: number): Promise<StorageType> { return 'googledrive'; }
export async function setStorageModeForYear(_year: number, _mode: StorageType): Promise<void> {}
export async function getStorageModeByYear(): Promise<Record<string, StorageType>> { return {}; }
export async function migrateGlobalStorageModeToPerYear(): Promise<void> {}

export async function getAllSettingsForExport(): Promise<Partial<SettingsValueMap>> {
	const records = await getAllSettings();
	const result: Partial<SettingsValueMap> = {};
	for (const record of records) {
		if (record.key === 'lastExportedAt') continue;
		(result as Record<string, unknown>)[record.key] = record.value;
	}
	return result;
}

export async function restoreAllSettings(settings: Partial<SettingsValueMap>, excludeKeys: (keyof SettingsValueMap)[] = []): Promise<void> {
	const allExcludes = new Set([...['lastExportedAt', 'storageMode', 'storageModeByYear'] as (keyof SettingsValueMap)[], ...excludeKeys]);
	for (const [key, value] of Object.entries(settings)) {
		if (allExcludes.has(key as keyof SettingsValueMap) || value === undefined) continue;
		await createRecord('settings', { key, value: JSON.parse(JSON.stringify(value)), updatedAt: new Date().toISOString() });
	}
}

export async function getLastExportedAt(): Promise<string | null> {
	const value = await getSetting('lastExportedAt');
	return (value !== undefined && typeof value === 'string') ? value : null;
}

export async function setLastExportedAt(date: string): Promise<void> { await setSetting('lastExportedAt', date); }

export async function getUnexportedAttachmentCount(): Promise<number> { return 0; }
export async function markAttachmentAsExported(_journalId: string, _attachmentId: string): Promise<void> {}
export async function getAutoPurgeBlobSetting(): Promise<boolean> { return false; }
export async function setAutoPurgeBlobSetting(_enabled: boolean): Promise<void> {}

export async function getSuppressRenameConfirm(): Promise<boolean> {
	return (await getSetting('suppressRenameConfirm')) ?? false;
}

export async function setSuppressRenameConfirm(suppress: boolean): Promise<void> {
	await setSetting('suppressRenameConfirm', suppress);
}

export async function getBlobRetentionDays(): Promise<number> { return 0; }
export async function setBlobRetentionDays(_days: number): Promise<void> {}
export async function getPurgeableBlobCount(): Promise<number> { return 0; }
export async function purgeExportedBlobs(): Promise<number> { return 0; }
export async function purgeAllExportedBlobs(): Promise<number> { return 0; }

export async function getAvailableYears(): Promise<number[]> {
	const { getAvailableYears: journalGetYears } = await import('./journal-repository');
	return journalGetYears();
}
