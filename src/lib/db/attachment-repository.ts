import type { Account, Attachment, DocumentType } from '$lib/types';
import {
	uploadAttachment as apiUploadAttachment,
	downloadAttachment as apiDownloadAttachment,
	deleteAttachment as apiDeleteAttachment
} from './api-client';
import { updateJournal, getJournalById } from './journal-repository';

export const DocumentTypeShortLabels: Record<DocumentType, string> = {
	invoice: '請求書発行',
	bill: '請求書',
	receipt: '領収書',
	contract: '契約書',
	estimate: '見積書',
	other: 'その他'
};

export function sanitizeFileName(str: string): string {
	return str.replace(/[\\\/:*?"<>|]/g, '_').trim();
}

function truncateToMaxBytes(name: string, maxBytes: number): string {
	const encoder = new TextEncoder();
	if (encoder.encode(name).length <= maxBytes) return name;
	let truncated = name;
	while (encoder.encode(truncated).length > maxBytes && truncated.length > 0) truncated = truncated.slice(0, -1);
	return truncated;
}

const MAX_FILENAME_BYTES = 240;

export function generateAttachmentName(documentDate: string, documentType: DocumentType, description: string, amount: number, vendor: string): string {
	const typeLabel = DocumentTypeShortLabels[documentType];
	const sanitizedDescription = sanitizeFileName(description) || '未分類';
	const amountStr = `${amount.toLocaleString('ja-JP')}円`;
	const sanitizedVendor = sanitizeFileName(vendor) || '不明';
	const prefix = `${documentDate}_${typeLabel}_`;
	const suffix = `_${amountStr}_${sanitizedVendor}`;
	const availableBytes = MAX_FILENAME_BYTES - new TextEncoder().encode(prefix).length - new TextEncoder().encode(suffix).length;
	const truncatedDescription = availableBytes > 0 ? truncateToMaxBytes(sanitizedDescription, availableBytes) : sanitizedDescription;
	return `${prefix}${truncatedDescription}${suffix}.pdf`;
}

export function validateManualFileName(fileName: string): string[] {
	const errors: string[] = [];
	if (!fileName || !fileName.trim()) { errors.push('ファイル名を入力してください'); return errors; }
	if (fileName.includes('..') || fileName.includes('/') || fileName.includes('\\')) errors.push('ファイル名にパス区切り文字（/ \\\ ..）は使用できません');
	if (/[:*?"<>|]/.test(fileName)) errors.push('ファイル名に使用できない文字が含まれています（: * ? " < > |）');
	if (/\.pdf\.pdf$/i.test(fileName)) errors.push('.pdf 拡張子が重複しています');
	if (!fileName.toLowerCase().endsWith('.pdf')) errors.push('ファイル名は .pdf で終わる必要があります');
	const byteLength = new TextEncoder().encode(fileName).length;
	if (byteLength > 255) errors.push(`ファイル名が長すぎます（${byteLength}バイト、最大255バイト）`);
	return errors;
}

export const UNPAID_ACCOUNT_CODES = ['2004', '2005', '2006'];
export const RECEIVABLE_ACCOUNT_CODES = ['1005'];

export function suggestDocumentType(accountType: Account['type'] | null, accountCode?: string): DocumentType {
	if (accountCode && UNPAID_ACCOUNT_CODES.includes(accountCode)) return 'receipt';
	if (accountCode && RECEIVABLE_ACCOUNT_CODES.includes(accountCode)) return 'invoice';
	if (!accountType) return 'bill';
	switch (accountType) {
		case 'expense': return 'bill';
		case 'revenue': return 'invoice';
		default: return 'bill';
	}
}

export async function getUsedFileNames(excludeAttachmentId?: string): Promise<Set<string>> {
	const { getAllJournals } = await import('./journal-repository');
	const journals = await getAllJournals();
	const usedNames = new Set<string>();
	for (const journal of journals)
		for (const attachment of journal.attachments)
			if (!excludeAttachmentId || attachment.id !== excludeAttachmentId)
				if (attachment.generatedName) usedNames.add(attachment.generatedName);
	return usedNames;
}

export function makeFileNameUnique(baseName: string, usedNames: Set<string>): string {
	if (!usedNames.has(baseName)) return baseName;
	const dotIdx = baseName.lastIndexOf('.');
	const ext = dotIdx >= 0 ? baseName.slice(dotIdx) : '';
	const nameWithoutExt = dotIdx >= 0 ? baseName.slice(0, dotIdx) : baseName;
	let counter = 2;
	let candidate = `${nameWithoutExt}_${counter}${ext}`;
	while (usedNames.has(candidate)) { counter++; candidate = `${nameWithoutExt}_${counter}${ext}`; }
	return candidate;
}

export function isAttachmentBlobPurged(_attachment: Attachment): boolean {
	return false;
}

export interface AttachmentParams {
	file: File; documentDate: string; documentType: DocumentType; generatedName: string;
	year: number; description: string; amount: number; vendor: string;
}

export async function addAttachmentToJournal(journalId: string, params: AttachmentParams, _directoryHandle?: FileSystemDirectoryHandle | null): Promise<Attachment> {
	const journal = await getJournalById(journalId);
	if (!journal) throw new Error('仕訳が見つかりません');
	const { file, documentDate, documentType, generatedName, year, description, amount, vendor } = params;
	const driveFileId = await apiUploadAttachment(file, year, generatedName);
	const attachment: Attachment = {
		id: crypto.randomUUID(), journalEntryId: journalId, documentDate, documentType,
		originalName: file.name, generatedName, mimeType: file.type, size: file.size,
		description, amount, vendor, storageType: 'googledrive', filePath: driveFileId,
		createdAt: new Date().toISOString()
	};
	await updateJournal(journalId, { attachments: [...journal.attachments, attachment], evidenceStatus: 'digital' });
	return attachment;
}

export async function removeAttachmentFromJournal(journalId: string, attachmentId: string, _directoryHandle?: FileSystemDirectoryHandle | null): Promise<void> {
	const journal = await getJournalById(journalId);
	if (!journal) throw new Error('仕訳が見つかりません');
	const target = journal.attachments.find((a) => a.id === attachmentId);
	if (target?.storageType === 'googledrive' && target.filePath)
		await apiDeleteAttachment(target.filePath).catch((e) => console.warn('Drive ファイル削除失敗:', e));
	const updatedAttachments = journal.attachments.filter((a) => a.id !== attachmentId);
	await updateJournal(journalId, { attachments: updatedAttachments, evidenceStatus: updatedAttachments.length > 0 ? 'digital' : 'none' });
}

export async function getAttachmentBlob(journalId: string, attachmentId: string, _directoryHandle?: FileSystemDirectoryHandle | null): Promise<Blob | null> {
	const journal = await getJournalById(journalId);
	if (!journal) return null;
	const attachment = journal.attachments.find((a) => a.id === attachmentId);
	if (!attachment) return null;
	if (attachment.storageType === 'googledrive' && attachment.filePath)
		return apiDownloadAttachment(attachment.filePath);
	return null;
}

export interface AttachmentUpdateParams {
	documentDate?: string; documentType?: DocumentType; description?: string;
	amount?: number; vendor?: string; generatedName?: string;
}

export async function updateAttachment(journalId: string, attachmentId: string, updates: AttachmentUpdateParams, _directoryHandle?: FileSystemDirectoryHandle | null): Promise<Attachment> {
	const journal = await getJournalById(journalId);
	if (!journal) throw new Error('仕訳が見つかりません');
	const idx = journal.attachments.findIndex((a) => a.id === attachmentId);
	if (idx === -1) throw new Error('添付ファイルが見つかりません');
	const attachment = journal.attachments[idx];
	const newDocumentDate = updates.documentDate ?? attachment.documentDate;
	const newDocumentType = updates.documentType ?? attachment.documentType;
	const newDescription = updates.description ?? attachment.description;
	const newAmount = updates.amount ?? attachment.amount;
	const newVendor = updates.vendor ?? attachment.vendor;
	let newGeneratedName: string;
	if (updates.generatedName) {
		const errors = validateManualFileName(updates.generatedName);
		if (errors.length > 0) throw new Error(`ファイル名が不正です: ${errors.join(', ')}`);
		newGeneratedName = updates.generatedName;
	} else {
		const baseName = generateAttachmentName(newDocumentDate, newDocumentType, newDescription, newAmount, newVendor);
		newGeneratedName = makeFileNameUnique(baseName, await getUsedFileNames(attachmentId));
	}
	const updatedAttachment: Attachment = { ...attachment, documentDate: newDocumentDate, documentType: newDocumentType, description: newDescription, amount: newAmount, vendor: newVendor, generatedName: newGeneratedName };
	const updatedAttachments = [...journal.attachments];
	updatedAttachments[idx] = updatedAttachment;
	await updateJournal(journalId, { attachments: updatedAttachments });
	return updatedAttachment;
}

export async function syncAttachmentsWithJournal(currentAttachments: Attachment[], updates: { date?: string; description?: string; amount?: number; vendor?: string }, _directoryHandle?: FileSystemDirectoryHandle | null): Promise<Attachment[]> {
	if (currentAttachments.length === 0) return [];
	const usedNames = await getUsedFileNames();
	for (const att of currentAttachments) usedNames.delete(att.generatedName);
	return currentAttachments.map((attachment) => {
		const newDocumentDate = updates.date ?? attachment.documentDate;
		const newDescription = updates.description ?? attachment.description;
		const newAmount = updates.amount ?? attachment.amount;
		const newVendor = updates.vendor ?? attachment.vendor;
		if (newDocumentDate === attachment.documentDate && newDescription === attachment.description && newAmount === attachment.amount && newVendor === attachment.vendor) {
			usedNames.add(attachment.generatedName);
			return attachment;
		}
		const baseName = generateAttachmentName(newDocumentDate, attachment.documentType, newDescription, newAmount, newVendor);
		const newGeneratedName = makeFileNameUnique(baseName, usedNames);
		usedNames.add(newGeneratedName);
		return { ...attachment, documentDate: newDocumentDate, description: newDescription, amount: newAmount, vendor: newVendor, generatedName: newGeneratedName };
	});
}
