import type {
	Attachment,
	BackupData,
	ExportData,
	JournalEntry,
	SettingsValueMap,
	StorageType
} from '$lib/types';
import type { FixedAsset } from '$lib/types/blue-return-types';
import type { Invoice } from '$lib/types/invoice';
import { userCol } from './database';
import { doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, query, where } from 'firebase/firestore';
import { restoreAllSettings } from './settings-repository';
import { getAllJournals, getJournalsByYear, updateJournal } from './journal-repository';
import { getAllVendors } from './vendor-repository';
import { getAllAccounts } from './account-repository';
import { getAllFixedAssets } from './fixed-asset-repository';
import { getAllInvoices } from './invoice-repository';

// ==================== インポート関連 ====================

export type ImportMode = 'merge' | 'overwrite';

export interface ImportResult {
	success: boolean;
	journalsImported: number;
	accountsImported: number;
	vendorsImported: number;
	fixedAssetsImported: number;
	invoicesImported: number;
	settingsRestored: boolean;
	errors: string[];
}

export function validateExportData(data: unknown): data is ExportData {
	if (!data || typeof data !== 'object') return false;
	const d = data as Record<string, unknown>;
	if (typeof d.version !== 'string') return false;
	if (typeof d.exportedAt !== 'string') return false;
	if (typeof d.fiscalYear !== 'number') return false;
	if (!Array.isArray(d.journals)) return false;
	if (!Array.isArray(d.accounts)) return false;
	if (!Array.isArray(d.vendors)) return false;
	for (const journal of d.journals as Record<string, unknown>[]) {
		if (typeof journal.id !== 'string') return false;
		if (typeof journal.date !== 'string') return false;
		if (typeof journal.createdAt !== 'string') return false;
		if (typeof journal.updatedAt !== 'string') return false;
		if (!Array.isArray(journal.lines)) return false;
	}
	return true;
}

export function validateBackupData(data: unknown): data is BackupData {
	if (!data || typeof data !== 'object') return false;
	const d = data as Record<string, unknown>;
	if (d.type !== 'backup') return false;
	if (typeof d.version !== 'string') return false;
	if (typeof d.exportedAt !== 'string') return false;
	if (!Array.isArray(d.journals)) return false;
	if (!Array.isArray(d.accounts)) return false;
	if (!Array.isArray(d.vendors)) return false;
	for (const journal of d.journals as Record<string, unknown>[]) {
		if (typeof journal.id !== 'string') return false;
		if (typeof journal.date !== 'string') return false;
		if (typeof journal.createdAt !== 'string') return false;
		if (typeof journal.updatedAt !== 'string') return false;
		if (!Array.isArray(journal.lines)) return false;
	}
	return true;
}

export function detectDataType(data: unknown): 'backup' | 'export' | 'unknown' {
	if (validateBackupData(data)) return 'backup';
	if (validateExportData(data)) return 'export';
	return 'unknown';
}

async function clearCollection(name: string): Promise<void> {
	const snap = await getDocs(userCol(name));
	for (const d of snap.docs) await deleteDoc(d.ref);
}

export async function importData(
	data: ExportData,
	mode: ImportMode = 'merge'
): Promise<ImportResult> {
	const result: ImportResult = {
		success: false,
		journalsImported: 0,
		accountsImported: 0,
		vendorsImported: 0,
		fixedAssetsImported: 0,
		invoicesImported: 0,
		settingsRestored: false,
		errors: []
	};

	try {
		if (mode === 'overwrite') {
			const existingJournals = await getJournalsByYear(data.fiscalYear);
			for (const journal of existingJournals) {
				await deleteDoc(doc(userCol('journals'), journal.id));
			}
		}

		// 勘定科目のインポート
		for (const account of data.accounts) {
			const existingSnap = await getDoc(doc(userCol('accounts'), account.code));
			const existing = existingSnap.exists();

			if (account.isSystem) {
				if (existing) {
					await updateDoc(doc(userCol('accounts'), account.code), {
						defaultTaxCategory: account.defaultTaxCategory,
						businessRatioEnabled: account.businessRatioEnabled,
						defaultBusinessRatio: account.defaultBusinessRatio
					});
				}
				continue;
			}

			if (!existing) {
				await setDoc(doc(userCol('accounts'), account.code), {
					code: account.code,
					name: account.name,
					type: account.type,
					isSystem: false,
					defaultTaxCategory: account.defaultTaxCategory,
					businessRatioEnabled: account.businessRatioEnabled,
					defaultBusinessRatio: account.defaultBusinessRatio,
					createdAt: account.createdAt
				});
				result.accountsImported++;
			} else if (mode === 'overwrite') {
				await updateDoc(doc(userCol('accounts'), account.code), {
					name: account.name,
					type: account.type,
					defaultTaxCategory: account.defaultTaxCategory,
					businessRatioEnabled: account.businessRatioEnabled,
					defaultBusinessRatio: account.defaultBusinessRatio
				});
				result.accountsImported++;
			}
		}

		// 取引先のインポート
		const allVendors = await getAllVendors();
		const existingVendorNames = new Set(allVendors.map((v) => v.name));
		for (const vendor of data.vendors) {
			if (!existingVendorNames.has(vendor.name)) {
				const id = crypto.randomUUID();
				await setDoc(doc(userCol('vendors'), id), {
					id,
					name: vendor.name,
					createdAt: vendor.createdAt
				});
				result.vendorsImported++;
			}
		}

		// 仕訳のインポート
		for (const journal of data.journals) {
			const existingSnap = await getDoc(doc(userCol('journals'), journal.id));

			const cleanJournal: JournalEntry = {
				id: journal.id,
				date: journal.date,
				lines: (journal.lines || []).map((line) => ({
					id: line.id,
					type: line.type,
					accountCode: line.accountCode,
					amount: line.amount,
					taxCategory: line.taxCategory,
					memo: line.memo,
					_businessRatioApplied: line._businessRatioApplied,
					_originalAmount: line._originalAmount,
					_businessRatio: line._businessRatio,
					_businessRatioGenerated: line._businessRatioGenerated
				})),
				vendor: journal.vendor,
				description: journal.description,
				evidenceStatus: journal.evidenceStatus,
				attachments: (journal.attachments || []).map((att) => ({
					id: att.id,
					journalEntryId: att.journalEntryId,
					documentDate: att.documentDate,
					documentType: att.documentType,
					originalName: att.originalName,
					generatedName: att.generatedName,
					mimeType: att.mimeType,
					size: att.size,
					description: att.description,
					amount: att.amount,
					vendor: att.vendor,
					storageType: att.storageType,
					filePath: att.filePath,
					exportedAt: att.exportedAt,
					blobPurgedAt: att.blobPurgedAt,
					archived: att.archived,
					createdAt: att.createdAt
				})),
				createdAt: journal.createdAt,
				updatedAt: journal.updatedAt
			};

			if (!existingSnap.exists()) {
				await setDoc(doc(userCol('journals'), journal.id), cleanJournal);
				result.journalsImported++;
			} else if (mode === 'overwrite') {
				const { createdAt: _c, id: _i, ...updates } = cleanJournal;
				await updateDoc(doc(userCol('journals'), journal.id), {
					...updates,
					updatedAt: journal.updatedAt
				});
				result.journalsImported++;
			}
		}

		// 固定資産のインポート
		if (data.fixedAssets && Array.isArray(data.fixedAssets)) {
			for (const asset of data.fixedAssets as FixedAsset[]) {
				const existingSnap = await getDoc(doc(userCol('fixed_assets'), asset.id));
				if (!existingSnap.exists()) {
					await setDoc(doc(userCol('fixed_assets'), asset.id), {
						id: asset.id,
						name: asset.name,
						category: asset.category,
						acquisitionDate: asset.acquisitionDate,
						acquisitionCost: asset.acquisitionCost,
						usefulLife: asset.usefulLife,
						depreciationMethod: asset.depreciationMethod,
						depreciationRate: asset.depreciationRate,
						businessRatio: asset.businessRatio,
						status: asset.status,
						disposalDate: asset.disposalDate,
						memo: asset.memo,
						createdAt: asset.createdAt,
						updatedAt: asset.updatedAt
					});
					result.fixedAssetsImported++;
				} else if (mode === 'overwrite') {
					await updateDoc(doc(userCol('fixed_assets'), asset.id), {
						name: asset.name,
						category: asset.category,
						acquisitionDate: asset.acquisitionDate,
						acquisitionCost: asset.acquisitionCost,
						usefulLife: asset.usefulLife,
						depreciationMethod: asset.depreciationMethod,
						depreciationRate: asset.depreciationRate,
						businessRatio: asset.businessRatio,
						status: asset.status,
						disposalDate: asset.disposalDate,
						memo: asset.memo,
						updatedAt: asset.updatedAt
					});
					result.fixedAssetsImported++;
				}
			}
		}

		// 請求書のインポート
		if (data.invoices && Array.isArray(data.invoices)) {
			for (const invoice of data.invoices as Invoice[]) {
				const existingSnap = await getDoc(doc(userCol('invoices'), invoice.id));
				const cleanItems = JSON.parse(JSON.stringify(invoice.items || []));
				const cleanTaxBreakdown = JSON.parse(JSON.stringify(invoice.taxBreakdown));
				if (!existingSnap.exists()) {
					await setDoc(doc(userCol('invoices'), invoice.id), {
						id: invoice.id,
						invoiceNumber: invoice.invoiceNumber,
						issueDate: invoice.issueDate,
						dueDate: invoice.dueDate,
						vendorId: invoice.vendorId,
						items: cleanItems,
						subtotal: invoice.subtotal,
						taxAmount: invoice.taxAmount,
						total: invoice.total,
						taxBreakdown: cleanTaxBreakdown,
						status: invoice.status,
						note: invoice.note,
						journalId: invoice.journalId,
						createdAt: invoice.createdAt,
						updatedAt: invoice.updatedAt
					});
					result.invoicesImported++;
				} else if (mode === 'overwrite') {
					await updateDoc(doc(userCol('invoices'), invoice.id), {
						invoiceNumber: invoice.invoiceNumber,
						issueDate: invoice.issueDate,
						dueDate: invoice.dueDate,
						vendorId: invoice.vendorId,
						items: cleanItems,
						subtotal: invoice.subtotal,
						taxAmount: invoice.taxAmount,
						total: invoice.total,
						taxBreakdown: cleanTaxBreakdown,
						status: invoice.status,
						note: invoice.note,
						journalId: invoice.journalId,
						updatedAt: invoice.updatedAt
					});
					result.invoicesImported++;
				}
			}
		}

		if (data.allSettings && typeof data.allSettings === 'object') {
			try {
				await restoreAllSettings(data.allSettings as Partial<SettingsValueMap>);
				result.settingsRestored = true;
			} catch (e) {
				result.errors.push(`設定の復元に失敗: ${e instanceof Error ? e.message : '不明なエラー'}`);
			}
		}

		result.success = true;
	} catch (error) {
		result.errors.push(error instanceof Error ? error.message : '不明なエラー');
	}

	return result;
}

export async function restoreAttachmentBlobs(
	attachmentBlobs: Map<string, Blob>,
	storageMode: StorageType,
	directoryHandle?: FileSystemDirectoryHandle | null,
	onProgress?: (current: number, total: number) => void
): Promise<{ restored: number; failed: number; errors: string[] }> {
	const result = { restored: 0, failed: 0, errors: [] as string[] };
	const total = attachmentBlobs.size;
	let current = 0;

	const journals = await getAllJournals();

	for (const [attachmentId, blob] of attachmentBlobs) {
		current++;
		onProgress?.(current, total);

		let targetJournal: JournalEntry | undefined;
		let targetAttachment: Attachment | undefined;

		for (const journal of journals) {
			const attachment = journal.attachments.find((a) => a.id === attachmentId);
			if (attachment) {
				targetJournal = journal;
				targetAttachment = attachment;
				break;
			}
		}

		if (!targetJournal || !targetAttachment) {
			result.failed++;
			result.errors.push(`証憑ID ${attachmentId} に対応する仕訳が見つかりません`);
			continue;
		}

		try {
			if (storageMode === 'filesystem' && directoryHandle) {
				const { saveFileToDirectory } = await import('$lib/utils/filesystem');
				const year = parseInt(targetAttachment.documentDate.substring(0, 4), 10);
				const file = new File([blob], targetAttachment.generatedName, {
					type: targetAttachment.mimeType
				});
				const filePath = await saveFileToDirectory(
					directoryHandle,
					year,
					targetAttachment.generatedName,
					file
				);
				const updatedAttachments = targetJournal.attachments.map((a) =>
					a.id === attachmentId ? { ...a, storageType: 'filesystem' as StorageType, filePath } : a
				);
				await updateJournal(targetJournal.id, { attachments: updatedAttachments });
			} else {
				// Firebase Storage にアップロード
				const { storage } = await import('$lib/firebase');
				const { getUid } = await import('$lib/stores/auth.svelte');
				const { ref, uploadBytes } = await import('firebase/storage');
				const uid = getUid();
				const fileRef = ref(storage, `users/${uid}/attachments/${attachmentId}`);
				await uploadBytes(fileRef, blob);
				const updatedAttachments = targetJournal.attachments.map((a) =>
					a.id === attachmentId
						? {
								...a,
								storageType: 'firebase' as StorageType,
								filePath: undefined,
								blobPurgedAt: undefined,
								archived: undefined
							}
						: a
				);
				await updateJournal(targetJournal.id, { attachments: updatedAttachments });
			}
			result.restored++;
		} catch (error) {
			result.failed++;
			result.errors.push(
				`${targetAttachment.generatedName}: ${error instanceof Error ? error.message : '不明なエラー'}`
			);
		}
	}

	return result;
}

export async function getImportPreview(data: ExportData): Promise<{
	fiscalYear: number;
	journalCount: number;
	newJournalCount: number;
	accountCount: number;
	newAccountCount: number;
	vendorCount: number;
	newVendorCount: number;
	fixedAssetCount: number;
	newFixedAssetCount: number;
	invoiceCount: number;
	newInvoiceCount: number;
	hasSettings: boolean;
}> {
	const existingJournalIds = new Set((await getAllJournals()).map((j) => j.id));
	const existingAccountCodes = new Set((await getAllAccounts()).map((a) => a.code));
	const existingVendorNames = new Set((await getAllVendors()).map((v) => v.name));
	const existingFixedAssetIds = new Set((await getAllFixedAssets()).map((a) => a.id));
	const existingInvoiceIds = new Set((await getAllInvoices()).map((i) => i.id));

	const newJournals = data.journals.filter((j) => !existingJournalIds.has(j.id));
	const newAccounts = data.accounts.filter((a) => !a.isSystem && !existingAccountCodes.has(a.code));
	const newVendors = data.vendors.filter((v) => !existingVendorNames.has(v.name));

	const fixedAssets = (data.fixedAssets as FixedAsset[] | undefined) ?? [];
	const invoices = (data.invoices as Invoice[] | undefined) ?? [];
	const newFixedAssets = fixedAssets.filter((a) => !existingFixedAssetIds.has(a.id));
	const newInvoices = invoices.filter((i) => !existingInvoiceIds.has(i.id));

	return {
		fiscalYear: data.fiscalYear,
		journalCount: data.journals.length,
		newJournalCount: newJournals.length,
		accountCount: data.accounts.filter((a) => !a.isSystem).length,
		newAccountCount: newAccounts.length,
		vendorCount: data.vendors.length,
		newVendorCount: newVendors.length,
		fixedAssetCount: fixedAssets.length,
		newFixedAssetCount: newFixedAssets.length,
		invoiceCount: invoices.length,
		newInvoiceCount: newInvoices.length,
		hasSettings: !!data.allSettings && Object.keys(data.allSettings).length > 0
	};
}

// ==================== フルリストア（BackupData） ====================

export interface FullRestoreResult {
	success: boolean;
	journalsRestored: number;
	accountsRestored: number;
	vendorsRestored: number;
	fixedAssetsRestored: number;
	invoicesRestored: number;
	settingsRestored: boolean;
	errors: string[];
}

export async function importBackupData(data: BackupData): Promise<FullRestoreResult> {
	const result: FullRestoreResult = {
		success: false,
		journalsRestored: 0,
		accountsRestored: 0,
		vendorsRestored: 0,
		fixedAssetsRestored: 0,
		invoicesRestored: 0,
		settingsRestored: false,
		errors: []
	};

	try {
		await clearCollection('journals');
		await clearCollection('accounts');
		await clearCollection('vendors');
		await clearCollection('fixed_assets');
		await clearCollection('invoices');

		for (const account of data.accounts) {
			try {
				await setDoc(doc(userCol('accounts'), account.code), {
					code: account.code,
					name: account.name,
					type: account.type,
					isSystem: account.isSystem,
					defaultTaxCategory: account.defaultTaxCategory,
					businessRatioEnabled: account.businessRatioEnabled,
					defaultBusinessRatio: account.defaultBusinessRatio,
					createdAt: account.createdAt
				});
				result.accountsRestored++;
			} catch (error) {
				result.errors.push(
					`勘定科目 ${account.code}: ${error instanceof Error ? error.message : '不明なエラー'}`
				);
			}
		}

		for (const vendor of data.vendors) {
			try {
				await setDoc(doc(userCol('vendors'), vendor.id), {
					id: vendor.id,
					name: vendor.name,
					address: vendor.address,
					contactName: vendor.contactName,
					email: vendor.email,
					phone: vendor.phone,
					paymentTerms: vendor.paymentTerms,
					note: vendor.note,
					createdAt: vendor.createdAt,
					updatedAt: vendor.updatedAt
				});
				result.vendorsRestored++;
			} catch (error) {
				result.errors.push(
					`取引先 ${vendor.name}: ${error instanceof Error ? error.message : '不明なエラー'}`
				);
			}
		}

		for (const journal of data.journals) {
			try {
				const cleanJournal: JournalEntry = {
					id: journal.id,
					date: journal.date,
					lines: (journal.lines || []).map((line) => ({
						id: line.id,
						type: line.type,
						accountCode: line.accountCode,
						amount: line.amount,
						taxCategory: line.taxCategory,
						memo: line.memo,
						_businessRatioApplied: line._businessRatioApplied,
						_originalAmount: line._originalAmount,
						_businessRatio: line._businessRatio,
						_businessRatioGenerated: line._businessRatioGenerated
					})),
					vendor: journal.vendor,
					description: journal.description,
					evidenceStatus: journal.evidenceStatus,
					attachments: (journal.attachments || []).map((att) => ({
						id: att.id,
						journalEntryId: att.journalEntryId,
						documentDate: att.documentDate,
						documentType: att.documentType,
						originalName: att.originalName,
						generatedName: att.generatedName,
						mimeType: att.mimeType,
						size: att.size,
						description: att.description,
						amount: att.amount,
						vendor: att.vendor,
						storageType: att.storageType,
						filePath: att.filePath,
						exportedAt: att.exportedAt,
						blobPurgedAt: att.blobPurgedAt,
						archived: att.archived,
						createdAt: att.createdAt
					})),
					createdAt: journal.createdAt,
					updatedAt: journal.updatedAt
				};
				await setDoc(doc(userCol('journals'), journal.id), cleanJournal);
				result.journalsRestored++;
			} catch (error) {
				result.errors.push(
					`仕訳 ${journal.id}: ${error instanceof Error ? error.message : '不明なエラー'}`
				);
			}
		}

		if (data.fixedAssets && Array.isArray(data.fixedAssets)) {
			for (const asset of data.fixedAssets as FixedAsset[]) {
				try {
					await setDoc(doc(userCol('fixed_assets'), asset.id), {
						id: asset.id,
						name: asset.name,
						category: asset.category,
						acquisitionDate: asset.acquisitionDate,
						acquisitionCost: asset.acquisitionCost,
						usefulLife: asset.usefulLife,
						depreciationMethod: asset.depreciationMethod,
						depreciationRate: asset.depreciationRate,
						businessRatio: asset.businessRatio,
						status: asset.status,
						disposalDate: asset.disposalDate,
						memo: asset.memo,
						createdAt: asset.createdAt,
						updatedAt: asset.updatedAt
					});
					result.fixedAssetsRestored++;
				} catch (error) {
					result.errors.push(
						`固定資産 ${asset.name}: ${error instanceof Error ? error.message : '不明なエラー'}`
					);
				}
			}
		}

		if (data.invoices && Array.isArray(data.invoices)) {
			for (const invoice of data.invoices as Invoice[]) {
				try {
					const cleanItems = JSON.parse(JSON.stringify(invoice.items || []));
					const cleanTaxBreakdown = JSON.parse(JSON.stringify(invoice.taxBreakdown));
					await setDoc(doc(userCol('invoices'), invoice.id), {
						id: invoice.id,
						invoiceNumber: invoice.invoiceNumber,
						issueDate: invoice.issueDate,
						dueDate: invoice.dueDate,
						vendorId: invoice.vendorId,
						items: cleanItems,
						subtotal: invoice.subtotal,
						taxAmount: invoice.taxAmount,
						total: invoice.total,
						taxBreakdown: cleanTaxBreakdown,
						status: invoice.status,
						note: invoice.note,
						journalId: invoice.journalId,
						createdAt: invoice.createdAt,
						updatedAt: invoice.updatedAt
					});
					result.invoicesRestored++;
				} catch (error) {
					result.errors.push(
						`請求書 ${invoice.invoiceNumber}: ${error instanceof Error ? error.message : '不明なエラー'}`
					);
				}
			}
		}

		if (data.allSettings && typeof data.allSettings === 'object') {
			try {
				await restoreAllSettings(data.allSettings as Partial<SettingsValueMap>);
				result.settingsRestored = true;
			} catch (e) {
				result.errors.push(`設定の復元に失敗: ${e instanceof Error ? e.message : '不明なエラー'}`);
			}
		}

		result.success = true;
	} catch (error) {
		result.errors.push(error instanceof Error ? error.message : '不明なエラー');
	}

	return result;
}

export function getBackupPreview(data: BackupData): {
	journalCount: number;
	accountCount: number;
	vendorCount: number;
	fixedAssetCount: number;
	invoiceCount: number;
	hasSettings: boolean;
	years: number[];
} {
	const yearSet = new Set<number>();
	for (const journal of data.journals) {
		const year = parseInt(journal.date.substring(0, 4), 10);
		if (!isNaN(year)) yearSet.add(year);
	}

	return {
		journalCount: data.journals.length,
		accountCount: data.accounts.length,
		vendorCount: data.vendors.length,
		fixedAssetCount: data.fixedAssets?.length ?? 0,
		invoiceCount: data.invoices?.length ?? 0,
		hasSettings: !!data.allSettings && Object.keys(data.allSettings).length > 0,
		years: Array.from(yearSet).sort((a, b) => a - b)
	};
}

// ==================== アーカイブリストア ====================

export interface ArchiveRestoreResult {
	success: boolean;
	journalsRestored: number;
	journalsSkipped: number;
	errors: string[];
}

export async function importArchiveData(data: ExportData): Promise<ArchiveRestoreResult> {
	const result: ArchiveRestoreResult = {
		success: false,
		journalsRestored: 0,
		journalsSkipped: 0,
		errors: []
	};

	try {
		for (const journal of data.journals) {
			const existingSnap = await getDoc(doc(userCol('journals'), journal.id));

			if (existingSnap.exists()) {
				result.journalsSkipped++;
				continue;
			}

			try {
				const cleanJournal: JournalEntry = {
					id: journal.id,
					date: journal.date,
					lines: (journal.lines || []).map((line) => ({
						id: line.id,
						type: line.type,
						accountCode: line.accountCode,
						amount: line.amount,
						taxCategory: line.taxCategory,
						memo: line.memo,
						_businessRatioApplied: line._businessRatioApplied,
						_originalAmount: line._originalAmount,
						_businessRatio: line._businessRatio,
						_businessRatioGenerated: line._businessRatioGenerated
					})),
					vendor: journal.vendor,
					description: journal.description,
					evidenceStatus: journal.evidenceStatus,
					attachments: (journal.attachments || []).map((att) => ({
						id: att.id,
						journalEntryId: att.journalEntryId,
						documentDate: att.documentDate,
						documentType: att.documentType,
						originalName: att.originalName,
						generatedName: att.generatedName,
						mimeType: att.mimeType,
						size: att.size,
						description: att.description,
						amount: att.amount,
						vendor: att.vendor,
						storageType: att.storageType,
						filePath: att.filePath,
						exportedAt: att.exportedAt,
						blobPurgedAt: att.blobPurgedAt,
						archived: att.archived,
						createdAt: att.createdAt
					})),
					createdAt: journal.createdAt,
					updatedAt: journal.updatedAt
				};
				await setDoc(doc(userCol('journals'), journal.id), cleanJournal);
				result.journalsRestored++;
			} catch (error) {
				result.errors.push(
					`仕訳 ${journal.id}: ${error instanceof Error ? error.message : '不明なエラー'}`
				);
			}
		}

		result.success = true;
	} catch (error) {
		result.errors.push(error instanceof Error ? error.message : '不明なエラー');
	}

	return result;
}

export async function getArchiveRestorePreview(data: ExportData): Promise<{
	fiscalYear: number;
	journalCount: number;
	newJournalCount: number;
	skippedJournalCount: number;
	attachmentCount: number;
}> {
	const existingJournalIds = new Set((await getAllJournals()).map((j) => j.id));

	const newJournals = data.journals.filter((j) => !existingJournalIds.has(j.id));
	const skippedJournals = data.journals.filter((j) => existingJournalIds.has(j.id));

	let attachmentCount = 0;
	for (const journal of newJournals) {
		attachmentCount += (journal.attachments || []).length;
	}

	return {
		fiscalYear: data.fiscalYear,
		journalCount: data.journals.length,
		newJournalCount: newJournals.length,
		skippedJournalCount: skippedJournals.length,
		attachmentCount
	};
}
