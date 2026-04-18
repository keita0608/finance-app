import type { FixedAsset } from '$lib/types/blue-return-types';
import { listRecords, getRecord, createRecord, updateRecord, deleteRecord } from './api-client';

export async function getAllFixedAssets(): Promise<FixedAsset[]> {
	return (await listRecords<FixedAsset>('fixed-assets')).sort((a, b) => b.acquisitionDate.localeCompare(a.acquisitionDate));
}

export async function getActiveFixedAssets(): Promise<FixedAsset[]> {
	return (await getAllFixedAssets()).filter((a) => a.status === 'active');
}

export async function getFixedAssetById(id: string): Promise<FixedAsset | undefined> {
	return getRecord<FixedAsset>('fixed-assets', id);
}

export async function addFixedAsset(asset: Omit<FixedAsset, 'id' | 'createdAt' | 'updatedAt'>): Promise<string> {
	const id = crypto.randomUUID();
	const now = new Date().toISOString();
	await createRecord<FixedAsset>('fixed-assets', { ...asset, id, createdAt: now, updatedAt: now });
	return id;
}

export async function updateFixedAsset(id: string, updates: Partial<Omit<FixedAsset, 'id' | 'createdAt'>>): Promise<void> {
	await updateRecord('fixed-assets', id, { ...updates, updatedAt: new Date().toISOString() } as Record<string, unknown>);
}

export async function deleteFixedAsset(id: string): Promise<void> {
	await deleteRecord('fixed-assets', id);
}

export async function markFixedAssetAsSold(id: string, disposalDate: string): Promise<void> {
	await updateFixedAsset(id, { status: 'sold', disposalDate });
}

export async function markFixedAssetAsDisposed(id: string, disposalDate: string): Promise<void> {
	await updateFixedAsset(id, { status: 'disposed', disposalDate });
}
