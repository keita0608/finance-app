import type { Invoice, InvoiceStatus } from '$lib/types/invoice';
import { userCol } from './database';
import { doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, query, where, orderBy } from 'firebase/firestore';

export async function getAllInvoices(): Promise<Invoice[]> {
	const q = query(userCol('invoices'), orderBy('issueDate', 'desc'));
	const snap = await getDocs(q);
	return snap.docs.map((d) => d.data() as Invoice);
}

export async function getInvoiceById(id: string): Promise<Invoice | undefined> {
	const snap = await getDoc(doc(userCol('invoices'), id));
	return snap.exists() ? (snap.data() as Invoice) : undefined;
}

export async function getInvoicesByYear(year: number): Promise<Invoice[]> {
	const startDate = `${year}-01-01`;
	const endDate = `${year}-12-31`;
	const q = query(
		userCol('invoices'),
		where('issueDate', '>=', startDate),
		where('issueDate', '<=', endDate),
		orderBy('issueDate', 'desc')
	);
	const snap = await getDocs(q);
	return snap.docs.map((d) => d.data() as Invoice);
}

export async function getInvoicesByVendor(vendorId: string): Promise<Invoice[]> {
	const q = query(userCol('invoices'), where('vendorId', '==', vendorId), orderBy('issueDate', 'desc'));
	const snap = await getDocs(q);
	return snap.docs.map((d) => d.data() as Invoice);
}

export async function getInvoicesByStatus(status: InvoiceStatus): Promise<Invoice[]> {
	const q = query(userCol('invoices'), where('status', '==', status), orderBy('issueDate', 'desc'));
	const snap = await getDocs(q);
	return snap.docs.map((d) => d.data() as Invoice);
}

export async function addInvoice(
	invoice: Omit<Invoice, 'id' | 'createdAt' | 'updatedAt'>
): Promise<string> {
	const id = crypto.randomUUID();
	const now = new Date().toISOString();
	await setDoc(doc(userCol('invoices'), id), { ...invoice, id, createdAt: now, updatedAt: now });
	return id;
}

export async function updateInvoice(
	id: string,
	updates: Partial<Omit<Invoice, 'id' | 'createdAt'>>
): Promise<void> {
	await updateDoc(doc(userCol('invoices'), id), {
		...updates,
		updatedAt: new Date().toISOString()
	});
}

export async function deleteInvoice(id: string): Promise<void> {
	await deleteDoc(doc(userCol('invoices'), id));
}

export async function generateNextInvoiceNumber(year?: number): Promise<string> {
	const targetYear = year ?? new Date().getFullYear();
	const prefix = `INV-${targetYear}-`;
	const invoices = await getAllInvoices();
	const yearInvoices = invoices.filter((inv) => inv.invoiceNumber.startsWith(prefix));
	let maxNumber = 0;
	for (const inv of yearInvoices) {
		const num = parseInt(inv.invoiceNumber.replace(prefix, ''), 10);
		if (!isNaN(num) && num > maxNumber) maxNumber = num;
	}
	return `${prefix}${String(maxNumber + 1).padStart(4, '0')}`;
}
