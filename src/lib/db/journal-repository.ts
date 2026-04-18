import type { JournalEntry, TaxCategory } from '$lib/types';
import { listRecords, getRecord, createRecord, updateRecord, deleteRecord } from './api-client';
import { deleteAttachment } from './api-client';
import { saveVendor } from './vendor-repository';

export async function getJournalsByYear(year: number): Promise<JournalEntry[]> {
	const journals = await listRecords<JournalEntry>('journals', { year: String(year) });
	return journals.sort((a, b) => {
		const d = (b.date || '').localeCompare(a.date || '');
		if (d !== 0) return d;
		return (b.createdAt || b.updatedAt || '').localeCompare(a.createdAt || a.updatedAt || '');
	});
}

export async function getAllJournals(): Promise<JournalEntry[]> {
	const journals = await listRecords<JournalEntry>('journals');
	return journals.sort((a, b) => {
		const d = (b.date || '').localeCompare(a.date || '');
		if (d !== 0) return d;
		return (b.createdAt || b.updatedAt || '').localeCompare(a.createdAt || a.updatedAt || '');
	});
}

export async function getAvailableYears(): Promise<number[]> {
	const currentYear = new Date().getFullYear();
	const journals = await listRecords<JournalEntry>('journals');
	const years = new Set<number>([currentYear]);
	for (const j of journals) {
		const y = parseInt(j.date.substring(0, 4), 10);
		if (!isNaN(y)) years.add(y);
	}
	return Array.from(years).sort((a, b) => b - a);
}

export async function getJournalById(id: string): Promise<JournalEntry | undefined> {
	return getRecord<JournalEntry>('journals', id);
}

export async function addJournal(journal: Omit<JournalEntry, 'id' | 'createdAt' | 'updatedAt'>): Promise<string> {
	const now = new Date().toISOString();
	const id = crypto.randomUUID();
	await createRecord<JournalEntry>('journals', { ...journal, id, createdAt: now, updatedAt: now });
	if (journal.vendor) await saveVendor(journal.vendor);
	return id;
}

export async function updateJournal(id: string, updates: Partial<Omit<JournalEntry, 'id' | 'createdAt'>>): Promise<void> {
	await updateRecord('journals', id, { ...updates, updatedAt: new Date().toISOString() } as Record<string, unknown>);
}

export async function deleteJournal(id: string, _directoryHandle?: FileSystemDirectoryHandle | null): Promise<void> {
	const journal = await getJournalById(id);
	if (!journal) return;
	for (const attachment of journal.attachments) {
		if (attachment.storageType === 'googledrive' && attachment.filePath) {
			await deleteAttachment(attachment.filePath).catch((e) => console.warn('証憑の削除に失敗:', e));
		}
	}
	await deleteRecord('journals', id);
}

export async function countJournalLinesByAccountCode(accountCode: string): Promise<number> {
	const journals = await listRecords<JournalEntry>('journals');
	let count = 0;
	for (const j of journals) for (const l of j.lines) if (l.accountCode === accountCode) count++;
	return count;
}

export async function updateTaxCategoryByAccountCode(accountCode: string, newTaxCategory: TaxCategory): Promise<number> {
	const journals = await listRecords<JournalEntry>('journals');
	let updatedCount = 0;
	for (const journal of journals) {
		let hasUpdate = false;
		const updatedLines = journal.lines.map((line) => {
			if (line.accountCode === accountCode && line.taxCategory !== newTaxCategory) {
				hasUpdate = true;
				updatedCount++;
				return { ...line, taxCategory: newTaxCategory };
			}
			return line;
		});
		if (hasUpdate) await updateJournal(journal.id, { lines: updatedLines });
	}
	return updatedCount;
}

export async function deleteYearData(year: number, _directoryHandle?: FileSystemDirectoryHandle | null): Promise<{ journalCount: number; attachmentCount: number; invoiceCount: number; localFilesDeleted: number; localFilesFailed: number }> {
	const journals = await getJournalsByYear(year);
	let attachmentCount = 0;
	for (const journal of journals) {
		for (const attachment of journal.attachments) {
			if (attachment.storageType === 'googledrive' && attachment.filePath) {
				await deleteAttachment(attachment.filePath).catch(() => {});
			}
			attachmentCount++;
		}
		await deleteRecord('journals', journal.id);
	}
	const { deleteInvoice, getInvoicesByYear } = await import('./invoice-repository');
	const invoices = await getInvoicesByYear(year);
	for (const inv of invoices) await deleteInvoice(inv.id);
	return { journalCount: journals.length, attachmentCount, invoiceCount: invoices.length, localFilesDeleted: 0, localFilesFailed: 0 };
}

export function createEmptyJournal(): Omit<JournalEntry, 'id' | 'createdAt' | 'updatedAt'> {
	return {
		date: new Date().toISOString().slice(0, 10),
		lines: [
			{ id: crypto.randomUUID(), type: 'debit', accountCode: '', amount: 0 },
			{ id: crypto.randomUUID(), type: 'credit', accountCode: '', amount: 0 }
		],
		vendor: '',
		description: '',
		evidenceStatus: 'none',
		attachments: []
	};
}

export function validateJournal(journal: Pick<JournalEntry, 'lines'>): { isValid: boolean; debitTotal: number; creditTotal: number; hasEmptyAccounts: boolean } {
	const debitTotal = journal.lines.filter((l) => l.type === 'debit').reduce((s, l) => s + l.amount, 0);
	const creditTotal = journal.lines.filter((l) => l.type === 'credit').reduce((s, l) => s + l.amount, 0);
	const hasEmptyAccounts = journal.lines.some((l) => !l.accountCode);
	return { isValid: debitTotal === creditTotal && debitTotal > 0 && !hasEmptyAccounts, debitTotal, creditTotal, hasEmptyAccounts };
}
