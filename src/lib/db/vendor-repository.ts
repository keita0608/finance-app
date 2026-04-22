import type { Vendor } from '$lib/types';
import { userCol } from './database';
import {
	doc,
	getDoc,
	getDocs,
	setDoc,
	updateDoc,
	deleteDoc,
	query,
	where,
	orderBy
} from 'firebase/firestore';

export async function saveVendor(name: string): Promise<void> {
	const trimmed = name.trim();
	if (!trimmed) return;
	const all = await getAllVendors();
	if (all.some((v) => v.name === trimmed)) return;
	const id = crypto.randomUUID();
	const now = new Date().toISOString();
	await setDoc(doc(userCol('vendors'), id), { id, name: trimmed, createdAt: now });
}

export async function getAllVendors(): Promise<Vendor[]> {
	const q = query(userCol('vendors'), orderBy('name'));
	const snap = await getDocs(q);
	return snap.docs.map((d) => d.data() as Vendor);
}

export async function searchVendors(query_: string): Promise<Vendor[]> {
	if (!query_) return getAllVendors();
	const lowerQuery = query_.toLowerCase();
	const all = await getAllVendors();
	return all.filter((v) => v.name.toLowerCase().includes(lowerQuery));
}

export async function getVendorById(id: string): Promise<Vendor | undefined> {
	const snap = await getDoc(doc(userCol('vendors'), id));
	return snap.exists() ? (snap.data() as Vendor) : undefined;
}

export async function addVendorWithDetails(
	vendor: Omit<Vendor, 'id' | 'createdAt' | 'updatedAt'>
): Promise<string> {
	const id = crypto.randomUUID();
	const now = new Date().toISOString();
	await setDoc(doc(userCol('vendors'), id), { ...vendor, id, createdAt: now, updatedAt: now });
	return id;
}

export async function updateVendor(
	id: string,
	updates: Partial<Omit<Vendor, 'id' | 'createdAt'>>
): Promise<void> {
	await updateDoc(doc(userCol('vendors'), id), {
		...updates,
		updatedAt: new Date().toISOString()
	});
}

export async function isVendorInUseByInvoice(vendorId: string): Promise<boolean> {
	const q = query(userCol('invoices'), where('vendorId', '==', vendorId));
	const snap = await getDocs(q);
	return !snap.empty;
}

export async function isVendorInUseByJournal(vendorId: string): Promise<boolean> {
	const vendor = await getVendorById(vendorId);
	if (!vendor) return false;
	const q = query(userCol('journals'), where('vendor', '==', vendor.name));
	const snap = await getDocs(q);
	return !snap.empty;
}

export async function deleteVendor(id: string): Promise<void> {
	if (await isVendorInUseByInvoice(id))
		throw new Error('この取引先は請求書で使用されているため削除できません');
	if (await isVendorInUseByJournal(id))
		throw new Error('この取引先は仕訳で使用されているため削除できません');
	await deleteDoc(doc(userCol('vendors'), id));
}
