import type { Vendor } from '$lib/types';
import { listRecords, getRecord, createRecord, updateRecord, deleteRecord } from './api-client';

export async function saveVendor(name: string): Promise<void> {
	const trimmed = name.trim();
	if (!trimmed) return;
	if (!(await getAllVendors()).find((v) => v.name === trimmed)) {
		await createRecord<Vendor>('vendors', { id: crypto.randomUUID(), name: trimmed, createdAt: new Date().toISOString() });
	}
}

export async function getAllVendors(): Promise<Vendor[]> {
	return (await listRecords<Vendor>('vendors')).sort((a, b) => a.name.localeCompare(b.name, 'ja'));
}

export async function searchVendors(query: string): Promise<Vendor[]> {
	if (!query) return getAllVendors();
	const q = query.toLowerCase();
	return (await getAllVendors()).filter((v) => v.name.toLowerCase().includes(q));
}

export async function getVendorById(id: string): Promise<Vendor | undefined> {
	return getRecord<Vendor>('vendors', id);
}

export async function addVendorWithDetails(vendor: Omit<Vendor, 'id' | 'createdAt'>): Promise<string> {
	const id = crypto.randomUUID();
	await createRecord<Vendor>('vendors', { ...vendor, id, createdAt: new Date().toISOString() });
	return id;
}

export async function updateVendor(id: string, updates: Partial<Omit<Vendor, 'id' | 'createdAt'>>): Promise<void> {
	await updateRecord('vendors', id, { ...updates, updatedAt: new Date().toISOString() } as Record<string, unknown>);
}

export async function isVendorInUseByInvoice(id: string): Promise<boolean> {
	return (await listRecords<{ vendorId: string }>('invoices')).some((inv) => inv.vendorId === id);
}

export async function isVendorInUseByJournal(name: string): Promise<boolean> {
	return (await listRecords<{ vendor: string }>('journals')).some((j) => j.vendor === name);
}

export async function deleteVendor(id: string): Promise<void> {
	await deleteRecord('vendors', id);
}
