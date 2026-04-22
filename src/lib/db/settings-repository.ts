import type { Attachment, SettingsKey, SettingsValueMap, StorageType } from '$lib/types';
import { userCol } from './database';
import { doc, getDoc, setDoc, getDocs, query, where } from 'firebase/firestore';
import { getAvailableYears } from './journal-repository';

export async function getSetting<K extends SettingsKey>(
	key: K
): Promise<SettingsValueMap[K] | undefined> {
	const snap = await getDoc(doc(userCol('settings'), key));
	if (!snap.exists()) return undefined;
	return snap.data().value as SettingsValueMap[K];
}

export async function setSetting<K extends SettingsKey>(
	key: K,
	value: SettingsValueMap[K]
): Promise<void> {
	const plainValue = JSON.parse(JSON.stringify(value));
	await setDoc(doc(userCol('settings'), key), {
		key,
		value: plainValue,
		updatedAt: new Date().toISOString()
	});
}

export async function getStorageMode(): Promise<StorageType> {
	const mode = await getSetting('storageMode');
	if (mode !== 'filesystem' && mode !== 'indexeddb' && mode !== 'firebase') return 'firebase';
	return mode;
}

export async function setStorageMode(mode: StorageType): Promise<void> {
	await setSetting('storageMode', mode);
}

export async function getStorageModeForYear(
	year: number,
	supportsFileSystem?: boolean
): Promise<StorageType> {
	const byYear = await getSetting('storageModeByYear');
	const yearKey = String(year);
	if (
		byYear &&
		(byYear[yearKey] === 'filesystem' ||
			byYear[yearKey] === 'indexeddb' ||
			byYear[yearKey] === 'firebase')
	) {
		return byYear[yearKey];
	}
	return 'firebase';
}

export async function setStorageModeForYear(year: number, mode: StorageType): Promise<void> {
	const byYear = (await getSetting('storageModeByYear')) ?? {};
	const updated = { ...byYear, [String(year)]: mode };
	await setSetting('storageModeByYear', updated);
}

export async function getStorageModeByYear(): Promise<Record<string, StorageType>> {
	return (await getSetting('storageModeByYear')) ?? {};
}

export async function migrateGlobalStorageModeToPerYear(): Promise<void> {
	// Firebase移行後はマイグレーション不要
}

export async function getAllSettingsForExport(): Promise<Partial<SettingsValueMap>> {
	const snap = await getDocs(userCol('settings'));
	const result: Partial<SettingsValueMap> = {};
	for (const d of snap.docs) {
		const { key, value } = d.data();
		if (key === 'lastExportedAt') continue;
		(result as Record<string, unknown>)[key] = value;
	}
	return result;
}

export async function restoreAllSettings(
	settings: Partial<SettingsValueMap>,
	excludeKeys: (keyof SettingsValueMap)[] = []
): Promise<void> {
	const defaultExcludes: (keyof SettingsValueMap)[] = [
		'lastExportedAt',
		'storageMode',
		'storageModeByYear'
	];
	const allExcludes = new Set([...defaultExcludes, ...excludeKeys]);
	for (const [key, value] of Object.entries(settings)) {
		if (allExcludes.has(key as keyof SettingsValueMap)) continue;
		if (value === undefined) continue;
		const plainValue = JSON.parse(JSON.stringify(value));
		await setDoc(doc(userCol('settings'), key), {
			key,
			value: plainValue,
			updatedAt: new Date().toISOString()
		});
	}
}

export async function getLastExportedAt(): Promise<string | null> {
	const value = await getSetting('lastExportedAt');
	return typeof value === 'string' ? value : null;
}

export async function setLastExportedAt(date: string): Promise<void> {
	await setSetting('lastExportedAt', date);
}

export async function getUnexportedAttachmentCount(): Promise<number> {
	const { getAllJournals } = await import('./journal-repository');
	const journals = await getAllJournals();
	let count = 0;
	for (const j of journals) {
		for (const att of j.attachments) {
			if (att.storageType === 'firebase' && !att.exportedAt) count++;
		}
	}
	return count;
}

export async function markAttachmentAsExported(
	journalId: string,
	attachmentId: string
): Promise<void> {
	const { getJournalById, updateJournal } = await import('./journal-repository');
	const journal = await getJournalById(journalId);
	if (!journal) return;
	const now = new Date().toISOString();
	const updatedAttachments = journal.attachments.map((att) =>
		att.id === attachmentId ? { ...att, exportedAt: now } : att
	);
	await updateJournal(journalId, { attachments: updatedAttachments });
}

export async function getAutoPurgeBlobSetting(): Promise<boolean> {
	const value = await getSetting('autoPurgeBlobAfterExport');
	return typeof value === 'boolean' ? value : true;
}

export async function setAutoPurgeBlobSetting(enabled: boolean): Promise<void> {
	await setSetting('autoPurgeBlobAfterExport', enabled);
}

export async function getSuppressRenameConfirm(): Promise<boolean> {
	const value = await getSetting('suppressRenameConfirm');
	return typeof value === 'boolean' ? value : false;
}

export async function setSuppressRenameConfirm(suppress: boolean): Promise<void> {
	await setSetting('suppressRenameConfirm', suppress);
}

export async function getBlobRetentionDays(): Promise<number> {
	const value = await getSetting('blobRetentionDays');
	return typeof value === 'number' && value >= 0 ? value : 30;
}

export async function setBlobRetentionDays(days: number): Promise<void> {
	await setSetting('blobRetentionDays', days);
}

export async function getPurgeableBlobCount(): Promise<number> {
	return 0;
}

export async function purgeExportedBlobs(): Promise<number> {
	return 0;
}

export async function purgeAllExportedBlobs(): Promise<number> {
	return 0;
}
