import type { Account } from '$lib/types';
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

export async function getAccountsByType(type: Account['type']): Promise<Account[]> {
	const q = query(userCol('accounts'), where('type', '==', type), orderBy('code'));
	const snap = await getDocs(q);
	return snap.docs.map((d) => d.data() as Account);
}

export async function getAccountByCode(code: string): Promise<Account | undefined> {
	const snap = await getDoc(doc(userCol('accounts'), code));
	return snap.exists() ? (snap.data() as Account) : undefined;
}

export async function getAllAccounts(): Promise<Account[]> {
	const q = query(userCol('accounts'), orderBy('code'));
	const snap = await getDocs(q);
	return snap.docs.map((d) => d.data() as Account);
}

export async function addAccount(
	account: Omit<Account, 'isSystem' | 'createdAt'>
): Promise<string> {
	const now = new Date().toISOString();
	const data: Account = { ...account, isSystem: false, createdAt: now };
	await setDoc(doc(userCol('accounts'), account.code), data);
	return account.code;
}

export async function updateAccount(
	code: string,
	updates: Partial<Omit<Account, 'code' | 'isSystem' | 'createdAt'>>
): Promise<void> {
	await updateDoc(doc(userCol('accounts'), code), updates as Record<string, unknown>);
}

export async function deleteAccount(code: string): Promise<void> {
	const snap = await getDoc(doc(userCol('accounts'), code));
	if (snap.data()?.isSystem) throw new Error('システム勘定科目は削除できません');
	await deleteDoc(doc(userCol('accounts'), code));
}

export async function isAccountInUse(code: string): Promise<boolean> {
	const journals = await getAllAccounts();
	// journalリポジトリをインポートすると循環になるため、Firestore直接クエリで代替
	const { getAllJournals } = await import('./journal-repository');
	const allJournals = await getAllJournals();
	return allJournals.some((j) => j.lines.some((l) => l.accountCode === code));
}

export function isSystemAccount(code: string): boolean {
	return code.length === 4 && code[1] === '0';
}

const CATEGORY_PREFIX: Record<Account['type'], number> = {
	asset: 1,
	liability: 2,
	equity: 3,
	revenue: 4,
	expense: 5
};

export async function generateNextCode(type: Account['type']): Promise<string> {
	const prefix = CATEGORY_PREFIX[type];
	const minCode = prefix * 1000 + 100;
	const maxCode = prefix * 1000 + 199;

	const accounts = await getAccountsByType(type);
	const codes = accounts
		.map((a) => parseInt(a.code, 10))
		.filter((n) => !isNaN(n) && n >= minCode && n <= maxCode)
		.sort((a, b) => a - b);

	if (codes.length === 0) return String(minCode);
	const nextCode = codes[codes.length - 1] + 1;
	if (nextCode > maxCode) throw new Error(`${type} のユーザー追加科目の上限（99件）に達しました`);
	return String(nextCode);
}
