import type { FixedAsset } from '$lib/types/blue-return-types';
import { userCol } from './database';
import { doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, query, where, orderBy } from 'firebase/firestore';

export async function getAllFixedAssets(): Promise<FixedAsset[]> {
	const q = query(userCol('fixed_assets'), orderBy('acquisitionDate', 'desc'));
	const snap = await getDocs(q);
	return snap.docs.map((d) => d.data() as FixedAsset);
}

export async function getActiveFixedAssets(): Promise<FixedAsset[]> {
	const q = query(userCol('fixed_assets'), where('status', '==', 'active'));
	const snap = await getDocs(q);
	return snap.docs.map((d) => d.data() as FixedAsset);
}

export async function getFixedAssetById(id: string): Promise<FixedAsset | undefined> {
	const snap = await getDoc(doc(userCol('fixed_assets'), id));
	return snap.exists() ? (snap.data() as FixedAsset) : undefined;
}

export async function addFixedAsset(
	asset: Omit<FixedAsset, 'id' | 'createdAt' | 'updatedAt'>
): Promise<string> {
	const id = crypto.randomUUID();
	const now = new Date().toISOString();
	await setDoc(doc(userCol('fixed_assets'), id), { ...asset, id, createdAt: now, updatedAt: now });
	return id;
}

export async function updateFixedAsset(
	id: string,
	updates: Partial<Omit<FixedAsset, 'id' | 'createdAt'>>
): Promise<void> {
	await updateDoc(doc(userCol('fixed_assets'), id), {
		...updates,
		updatedAt: new Date().toISOString()
	});
}

export async function deleteFixedAsset(id: string): Promise<void> {
	await deleteDoc(doc(userCol('fixed_assets'), id));
}

export async function markFixedAssetAsSold(id: string, disposalDate: string): Promise<void> {
	await updateFixedAsset(id, { status: 'sold', disposalDate });
}

export async function markFixedAssetAsDisposed(id: string, disposalDate: string): Promise<void> {
	await updateFixedAsset(id, { status: 'disposed', disposalDate });
}
