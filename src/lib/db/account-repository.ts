import type { Account } from '$lib/types';
import { listRecords, createRecord, updateRecord, deleteRecord } from './api-client';
import { listRecords as listJournals } from './api-client';

export async function getAccountsByType(type: Account['type']): Promise<Account[]> {
	return (await getAllAccounts()).filter((a) => a.type === type);
}

export async function getAllAccounts(): Promise<Account[]> {
	return (await listRecords<Account>('accounts')).sort((a, b) => a.code.localeCompare(b.code));
}

export async function addAccount(account: Omit<Account, 'isSystem' | 'createdAt'>): Promise<string> {
	await createRecord<Account>('accounts', { ...account, isSystem: false, createdAt: new Date().toISOString() });
	return account.code;
}

export async function updateAccount(code: string, updates: Partial<Omit<Account, 'code' | 'isSystem' | 'createdAt'>>): Promise<void> {
	await updateRecord('accounts', code, updates as Record<string, unknown>);
}

export async function deleteAccount(code: string): Promise<void> {
	const account = (await getAllAccounts()).find((a) => a.code === code);
	if (account?.isSystem) throw new Error('システム勘定科目は削除できません');
	await deleteRecord('accounts', code);
}

export async function isAccountInUse(code: string): Promise<boolean> {
	const journals = await listJournals<{ lines: { accountCode: string }[] }>('journals');
	return journals.some((j) => j.lines.some((l) => l.accountCode === code));
}

export function isSystemAccount(code: string): boolean {
	return code.length === 4 && code[1] === '0';
}

export async function generateNextCode(type: Account['type']): Promise<string> {
	const CATEGORY_PREFIX: Record<Account['type'], number> = { asset: 1, liability: 2, equity: 3, revenue: 4, expense: 5 };
	const prefix = CATEGORY_PREFIX[type];
	const minCode = prefix * 1000 + 100;
	const maxCode = prefix * 1000 + 199;
	const codes = (await getAllAccounts()).filter((a) => a.type === type).map((a) => parseInt(a.code, 10)).filter((n) => !isNaN(n) && n >= minCode && n <= maxCode).sort((a, b) => a - b);
	if (codes.length === 0) return String(minCode);
	const nextCode = codes[codes.length - 1] + 1;
	if (nextCode > maxCode) throw new Error(`${type} のユーザー追加科目の上限（99件）に達しました`);
	return String(nextCode);
}
