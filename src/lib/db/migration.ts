import type { StorageType } from '$lib/types';
import { getAllJournals, getJournalById, updateJournal } from './journal-repository';

export interface MigrationAttachment {
	journalId: string;
	attachmentId: string;
	attachment: import('$lib/types').Attachment;
	year: number;
}

export async function getAttachmentsForMigration(
	targetStorageType: StorageType,
	filterYear?: number
): Promise<MigrationAttachment[]> {
	const journals = await getAllJournals();
	const result: MigrationAttachment[] = [];

	for (const journal of journals) {
		const year = parseInt(journal.date.substring(0, 4), 10);
		if (filterYear !== undefined && year !== filterYear) continue;

		for (const attachment of journal.attachments) {
			if (targetStorageType === 'filesystem') {
				if (
					(attachment.storageType === 'indexeddb' || attachment.storageType === 'firebase') &&
					!attachment.blobPurgedAt
				) {
					result.push({ journalId: journal.id, attachmentId: attachment.id, attachment, year });
				}
			} else {
				if (attachment.storageType === 'filesystem' && attachment.filePath) {
					result.push({ journalId: journal.id, attachmentId: attachment.id, attachment, year });
				}
			}
		}
	}

	return result;
}

export async function migrateAttachmentToFilesystem(
	item: MigrationAttachment,
	directoryHandle: FileSystemDirectoryHandle
): Promise<void> {
	const { saveFileToDirectory } = await import('$lib/utils/filesystem');
	const { getAttachmentBlob } = await import('./attachment-repository');

	const journal = await getJournalById(item.journalId);
	if (!journal) return;

	const attachment = journal.attachments.find((a) => a.id === item.attachmentId);
	if (!attachment) return;

	const blob = await getAttachmentBlob(item.journalId, item.attachmentId);
	if (!blob) return;

	const filePath = await saveFileToDirectory(
		directoryHandle,
		item.year,
		attachment.generatedName,
		blob
	);

	const updatedAttachments = journal.attachments.map((a) => {
		if (a.id === item.attachmentId) {
			return {
				...a,
				storageType: 'filesystem' as StorageType,
				filePath,
				exportedAt: undefined,
				blobPurgedAt: undefined
			};
		}
		return a;
	});

	await updateJournal(item.journalId, { attachments: updatedAttachments });
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function migrateAttachmentToIndexedDB(
	_item: MigrationAttachment,
	_directoryHandle: FileSystemDirectoryHandle
): Promise<void> {
	// IndexedDB blob storage is no longer supported; attachments are stored in Firebase Storage.
}

export async function getFilesystemAttachmentCount(): Promise<number> {
	const journals = await getAllJournals();
	let count = 0;
	for (const journal of journals) {
		for (const attachment of journal.attachments) {
			if (attachment.storageType === 'filesystem' && attachment.filePath) count++;
		}
	}
	return count;
}

export interface FolderMigrationItem {
	journalId: string;
	attachmentId: string;
	filePath: string;
	generatedName: string;
	year: number;
}

export async function getAttachmentsForFolderMigration(): Promise<FolderMigrationItem[]> {
	const journals = await getAllJournals();
	const result: FolderMigrationItem[] = [];

	for (const journal of journals) {
		const year = parseInt(journal.date.substring(0, 4), 10);
		for (const attachment of journal.attachments) {
			if (attachment.storageType === 'filesystem' && attachment.filePath) {
				result.push({
					journalId: journal.id,
					attachmentId: attachment.id,
					filePath: attachment.filePath,
					generatedName: attachment.generatedName,
					year
				});
			}
		}
	}

	return result;
}

export async function migrateAttachmentToNewFolder(
	item: FolderMigrationItem,
	oldDirectoryHandle: FileSystemDirectoryHandle,
	newDirectoryHandle: FileSystemDirectoryHandle
): Promise<void> {
	const { readFileFromDirectory, saveFileToDirectory, deleteFileFromDirectory } =
		await import('$lib/utils/filesystem');

	const blob = await readFileFromDirectory(oldDirectoryHandle, item.filePath);
	if (!blob) throw new Error(`ファイルが見つかりません: ${item.filePath}`);

	const newFilePath = await saveFileToDirectory(
		newDirectoryHandle,
		item.year,
		item.generatedName,
		blob
	);

	const journal = await getJournalById(item.journalId);
	if (!journal) return;

	const updatedAttachments = journal.attachments.map((a) => {
		if (a.id === item.attachmentId) return { ...a, filePath: newFilePath };
		return a;
	});

	await updateJournal(item.journalId, { attachments: updatedAttachments });

	try {
		await deleteFileFromDirectory(oldDirectoryHandle, item.filePath);
	} catch {
		console.warn(`旧ファイルの削除に失敗: ${item.filePath}`);
	}
}
