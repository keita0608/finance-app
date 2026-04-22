import type { JournalEntry, TaxCategory } from '$lib/types';
import { userCol } from './database';
import { getUid } from '$lib/stores/auth.svelte';
import { firestore, storage } from '$lib/firebase';
import {
	doc,
	getDoc,
	getDocs,
	setDoc,
	updateDoc,
	deleteDoc,
	query,
	where,
	orderBy,
	collection
} from 'firebase/firestore';
import { ref, deleteObject, listAll } from 'firebase/storage';
import { saveVendor } from './vendor-repository';

export async function getJournalsByYear(year: number): Promise<JournalEntry[]> {
	const startDate = `${year}-01-01`;
	const endDate = `${year}-12-31`;
	const q = query(
		userCol('journals'),
		where('date', '>=', startDate),
		where('date', '<=', endDate),
		orderBy('date', 'desc')
	);
	const snap = await getDocs(q);
	return snap.docs
		.map((d) => d.data() as JournalEntry)
		.sort((a, b) => {
			const dateCompare = (b.date || '').localeCompare(a.date || '');
			if (dateCompare !== 0) return dateCompare;
			return (b.createdAt || '').localeCompare(a.createdAt || '');
		});
}

export async function getAllJournals(): Promise<JournalEntry[]> {
	const q = query(userCol('journals'), orderBy('date', 'desc'));
	const snap = await getDocs(q);
	return snap.docs
		.map((d) => d.data() as JournalEntry)
		.sort((a, b) => {
			const dateCompare = (b.date || '').localeCompare(a.date || '');
			if (dateCompare !== 0) return dateCompare;
			return (b.createdAt || '').localeCompare(a.createdAt || '');
		});
}

export async function getAvailableYears(): Promise<number[]> {
	const currentYear = new Date().getFullYear();
	const snap = await getDocs(userCol('journals'));
	const years = new Set<number>([currentYear]);
	for (const d of snap.docs) {
		const year = parseInt((d.data() as JournalEntry).date.substring(0, 4), 10);
		if (!isNaN(year)) years.add(year);
	}
	return Array.from(years).sort((a, b) => b - a);
}

export async function getJournalById(id: string): Promise<JournalEntry | undefined> {
	const snap = await getDoc(doc(userCol('journals'), id));
	return snap.exists() ? (snap.data() as JournalEntry) : undefined;
}

export async function addJournal(
	journal: Omit<JournalEntry, 'id' | 'createdAt' | 'updatedAt'>
): Promise<string> {
	const now = new Date().toISOString();
	const id = crypto.randomUUID();
	await setDoc(doc(userCol('journals'), id), { ...journal, id, createdAt: now, updatedAt: now });
	if (journal.vendor) await saveVendor(journal.vendor);
	return id;
}

export async function updateJournal(
	id: string,
	updates: Partial<Omit<JournalEntry, 'id' | 'createdAt'>>
): Promise<void> {
	const plain = JSON.parse(JSON.stringify(updates));
	await updateDoc(doc(userCol('journals'), id), {
		...plain,
		updatedAt: new Date().toISOString()
	});
}

export async function deleteJournal(
	id: string,
	_directoryHandle?: FileSystemDirectoryHandle | null
): Promise<void> {
	const journal = await getJournalById(id);
	if (!journal) return;
	// Firebase Storage の添付ファイルを削除
	const uid = getUid();
	for (const att of journal.attachments) {
		if (att.storageType === 'firebase') {
			try {
				const fileRef = ref(storage, `users/${uid}/attachments/${att.id}`);
				await deleteObject(fileRef);
			} catch {}
		}
	}
	await deleteDoc(doc(userCol('journals'), id));
}

export async function countJournalLinesByAccountCode(accountCode: string): Promise<number> {
	const journals = await getAllJournals();
	let count = 0;
	for (const j of journals) {
		for (const line of j.lines) {
			if (line.accountCode === accountCode) count++;
		}
	}
	return count;
}

export async function updateTaxCategoryByAccountCode(
	accountCode: string,
	newTaxCategory: TaxCategory
): Promise<number> {
	const journals = await getAllJournals();
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
		if (hasUpdate) {
			await updateDoc(doc(userCol('journals'), journal.id), {
				lines: updatedLines,
				updatedAt: new Date().toISOString()
			});
		}
	}
	return updatedCount;
}

export async function deleteYearData(
	year: number,
	_directoryHandle?: FileSystemDirectoryHandle | null
): Promise<{
	journalCount: number;
	attachmentCount: number;
	invoiceCount: number;
	localFilesDeleted: number;
	localFilesFailed: number;
}> {
	const uid = getUid();
	const journals = await getJournalsByYear(year);
	let attachmentCount = 0;

	for (const journal of journals) {
		for (const att of journal.attachments) {
			if (att.storageType === 'firebase') {
				try {
					await deleteObject(ref(storage, `users/${uid}/attachments/${att.id}`));
				} catch {}
			}
			attachmentCount++;
		}
		await deleteDoc(doc(userCol('journals'), journal.id));
	}

	const startDate = `${year}-01-01`;
	const endDate = `${year}-12-31`;
	const invQ = query(
		userCol('invoices'),
		where('issueDate', '>=', startDate),
		where('issueDate', '<=', endDate)
	);
	const invSnap = await getDocs(invQ);
	for (const d of invSnap.docs) await deleteDoc(d.ref);

	return {
		journalCount: journals.length,
		attachmentCount,
		invoiceCount: invSnap.size,
		localFilesDeleted: 0,
		localFilesFailed: 0
	};
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

export function validateJournal(journal: Pick<JournalEntry, 'lines'>): {
	isValid: boolean;
	debitTotal: number;
	creditTotal: number;
	hasEmptyAccounts: boolean;
} {
	const debitTotal = journal.lines
		.filter((l) => l.type === 'debit')
		.reduce((s, l) => s + l.amount, 0);
	const creditTotal = journal.lines
		.filter((l) => l.type === 'credit')
		.reduce((s, l) => s + l.amount, 0);
	const hasEmptyAccounts = journal.lines.some((l) => !l.accountCode);
	return {
		isValid: debitTotal === creditTotal && debitTotal > 0 && !hasEmptyAccounts,
		debitTotal,
		creditTotal,
		hasEmptyAccounts
	};
}
