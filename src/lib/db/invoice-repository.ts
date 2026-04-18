import type { Invoice, InvoiceStatus } from '$lib/types/invoice';
import { listRecords, getRecord, createRecord, updateRecord, deleteRecord } from './api-client';

export async function getAllInvoices(): Promise<Invoice[]> {
	return (await listRecords<Invoice>('invoices')).sort((a, b) => b.issueDate.localeCompare(a.issueDate));
}

export async function getInvoiceById(id: string): Promise<Invoice | undefined> {
	return getRecord<Invoice>('invoices', id);
}

export async function getInvoicesByYear(year: number): Promise<Invoice[]> {
	const all = await getAllInvoices();
	return all.filter((inv) => inv.issueDate >= `${year}-01-01` && inv.issueDate <= `${year}-12-31`);
}

export async function getInvoicesByVendor(vendorId: string): Promise<Invoice[]> {
	return (await getAllInvoices()).filter((inv) => inv.vendorId === vendorId);
}

export async function getInvoicesByStatus(status: InvoiceStatus): Promise<Invoice[]> {
	return (await getAllInvoices()).filter((inv) => inv.status === status);
}

export async function addInvoice(invoice: Omit<Invoice, 'id' | 'createdAt' | 'updatedAt'>): Promise<string> {
	const id = crypto.randomUUID();
	const now = new Date().toISOString();
	await createRecord<Invoice>('invoices', { ...invoice, id, createdAt: now, updatedAt: now });
	return id;
}

export async function updateInvoice(id: string, updates: Partial<Omit<Invoice, 'id' | 'createdAt'>>): Promise<void> {
	await updateRecord('invoices', id, { ...updates, updatedAt: new Date().toISOString() } as Record<string, unknown>);
}

export async function deleteInvoice(id: string): Promise<void> {
	await deleteRecord('invoices', id);
}

export async function generateNextInvoiceNumber(year?: number): Promise<string> {
	const targetYear = year ?? new Date().getFullYear();
	const prefix = `INV-${targetYear}-`;
	let maxNumber = 0;
	for (const inv of (await getAllInvoices()).filter((i) => i.invoiceNumber.startsWith(prefix))) {
		const num = parseInt(inv.invoiceNumber.replace(prefix, ''), 10);
		if (!isNaN(num) && num > maxNumber) maxNumber = num;
	}
	return `${prefix}${String(maxNumber + 1).padStart(4, '0')}`;
}
