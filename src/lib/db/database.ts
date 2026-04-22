import { firestore } from '$lib/firebase';
import { getUid } from '$lib/stores/auth.svelte';
import { collection, type CollectionReference, type DocumentData } from 'firebase/firestore';
import type { SettingsKey, SettingsValueMap } from '$lib/types';

export type SettingsRecord = {
	[K in SettingsKey]: {
		key: K;
		value: SettingsValueMap[K];
		updatedAt: string;
	};
}[SettingsKey];

export function userCol(name: string): CollectionReference<DocumentData> {
	return collection(firestore, 'users', getUid(), name);
}

export async function initializeDatabase(): Promise<void> {
	const { getAllAccounts, addAccount } = await import('./account-repository');
	const { defaultAccounts } = await import('./seed');
	const accounts = await getAllAccounts();
	if (accounts.length === 0) {
		for (const account of defaultAccounts) {
			await addAccount({ ...account }).catch(() => {});
		}
	}
}
