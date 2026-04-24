import type { Account, JournalEntry, TaxCategory } from '$lib/types';
import { AccountTypeLabels, TaxCategoryLabels } from '$lib/types';

export interface ParsedJournal {
	date: string;
	description: string;
	vendor: string;
	lines: Array<{
		type: 'debit' | 'credit';
		accountCode: string;
		amount: number;
		taxCategory?: TaxCategory;
	}>;
}

export interface CsvParseResult {
	journals: ParsedJournal[];
	errors: string[];
	warnings: string[];
}

// 消費税区分: コード or 日本語ラベル どちらでも受け付ける
const TAX_LABEL_TO_CODE: Record<string, TaxCategory> = {
	sales_10: 'sales_10',
	sales_8: 'sales_8',
	purchase_10: 'purchase_10',
	purchase_8: 'purchase_8',
	exempt: 'exempt',
	out_of_scope: 'out_of_scope',
	na: 'na'
};

// TaxCategoryLabels の逆引きマップを追加
for (const [code, label] of Object.entries(TaxCategoryLabels)) {
	TAX_LABEL_TO_CODE[label] = code as TaxCategory;
}

function parseTaxCategory(value: string): TaxCategory | undefined {
	const v = value.trim();
	return TAX_LABEL_TO_CODE[v];
}

function parseDate(value: string): string | null {
	const s = value.trim();
	if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
	const m = s.match(/^(\d{4})[/](\d{1,2})[/](\d{1,2})$/);
	if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
	return null;
}

/** RFC 4180 準拠の CSV 1行パーサー */
function parseCsvLine(line: string): string[] {
	const result: string[] = [];
	let i = 0;
	while (i <= line.length) {
		if (i === line.length) {
			result.push('');
			break;
		}
		if (line[i] === '"') {
			i++;
			let val = '';
			while (i < line.length) {
				if (line[i] === '"' && line[i + 1] === '"') {
					val += '"';
					i += 2;
				} else if (line[i] === '"') {
					i++;
					break;
				} else {
					val += line[i++];
				}
			}
			result.push(val);
			if (line[i] === ',') i++;
			else break;
		} else {
			const end = line.indexOf(',', i);
			if (end === -1) {
				result.push(line.slice(i));
				break;
			}
			result.push(line.slice(i, end));
			i = end + 1;
		}
	}
	return result;
}

function findCol(headers: string[], names: string[]): number {
	for (const name of names) {
		const idx = headers.findIndex((h) => h.trim() === name);
		if (idx >= 0) return idx;
	}
	return -1;
}

export function parseCsvJournals(csvText: string, accounts: Account[]): CsvParseResult {
	const errors: string[] = [];
	const warnings: string[] = [];

	// BOM 除去
	const text = csvText.startsWith('﻿') ? csvText.slice(1) : csvText;
	const rawLines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');

	if (rawLines.length < 2) {
		errors.push('データ行がありません');
		return { journals: [], errors, warnings };
	}

	// 勘定科目のルックアップマップ（コード・科目名どちらでも解決）
	const codeMap = new Map<string, Account>();
	const nameMap = new Map<string, Account>();
	for (const acc of accounts) {
		codeMap.set(acc.code, acc);
		nameMap.set(acc.name, acc);
	}

	function resolveAccount(val: string, row: number, side: '借方' | '貸方'): Account | null {
		const v = val.trim();
		if (!v) return null;
		const byCode = codeMap.get(v);
		if (byCode) return byCode;
		const byName = nameMap.get(v);
		if (byName) return byName;
		errors.push(`行${row}: ${side}科目「${v}」が見つかりません（コードまたは科目名で入力してください）`);
		return null;
	}

	// ヘッダー解析
	const headers = parseCsvLine(rawLines[0]);
	const ci = {
		date: findCol(headers, ['日付']),
		desc: findCol(headers, ['摘要']),
		vendor: findCol(headers, ['取引先']),
		debitAcc: findCol(headers, ['借方科目']),
		debitAmt: findCol(headers, ['借方金額']),
		creditAcc: findCol(headers, ['貸方科目']),
		creditAmt: findCol(headers, ['貸方金額']),
		tax: findCol(headers, ['消費税区分', '税区分'])
	};

	const required: Array<keyof typeof ci> = ['date', 'debitAcc', 'debitAmt', 'creditAcc', 'creditAmt'];
	const colNames: Partial<Record<keyof typeof ci, string>> = {
		date: '日付',
		debitAcc: '借方科目',
		debitAmt: '借方金額',
		creditAcc: '貸方科目',
		creditAmt: '貸方金額'
	};
	for (const key of required) {
		if (ci[key] === -1) {
			errors.push(`「${colNames[key]}」列が見つかりません`);
		}
	}
	if (errors.length > 0) return { journals: [], errors, warnings };

	const journals: ParsedJournal[] = [];
	let current: ParsedJournal | null = null;

	for (let i = 1; i < rawLines.length; i++) {
		const rawLine = rawLines[i];
		if (!rawLine.trim()) continue;

		const cols = parseCsvLine(rawLine);
		const row = i + 1;
		const dateVal = cols[ci.date]?.trim() ?? '';

		if (dateVal) {
			if (current) journals.push(current);
			const parsedDate = parseDate(dateVal);
			if (!parsedDate) {
				errors.push(`行${row}: 日付「${dateVal}」の形式が不正です（YYYY-MM-DD または YYYY/MM/DD）`);
				current = null;
				continue;
			}
			current = {
				date: parsedDate,
				description: ci.desc >= 0 ? (cols[ci.desc]?.trim() ?? '') : '',
				vendor: ci.vendor >= 0 ? (cols[ci.vendor]?.trim() ?? '') : '',
				lines: []
			};
		} else if (!current) {
			errors.push(`行${row}: 日付が空ですが、前の仕訳がありません`);
			continue;
		}

		if (!current) continue;

		const taxCat = ci.tax >= 0 ? parseTaxCategory(cols[ci.tax] ?? '') : undefined;
		const debitAccVal = cols[ci.debitAcc]?.trim() ?? '';
		const creditAccVal = cols[ci.creditAcc]?.trim() ?? '';
		const debitAmtStr = (cols[ci.debitAmt] ?? '').trim().replace(/,/g, '');
		const creditAmtStr = (cols[ci.creditAmt] ?? '').trim().replace(/,/g, '');

		if (debitAccVal) {
			const acc = resolveAccount(debitAccVal, row, '借方');
			if (acc) {
				const amount = parseInt(debitAmtStr, 10);
				if (isNaN(amount) || amount <= 0) {
					errors.push(`行${row}: 借方金額「${debitAmtStr}」が不正です（正の整数を入力してください）`);
				} else {
					current.lines.push({
						type: 'debit',
						accountCode: acc.code,
						amount,
						taxCategory: taxCat ?? acc.defaultTaxCategory
					});
				}
			}
		}

		if (creditAccVal) {
			const acc = resolveAccount(creditAccVal, row, '貸方');
			if (acc) {
				const amount = parseInt(creditAmtStr, 10);
				if (isNaN(amount) || amount <= 0) {
					errors.push(`行${row}: 貸方金額「${creditAmtStr}」が不正です（正の整数を入力してください）`);
				} else {
					current.lines.push({
						type: 'credit',
						accountCode: acc.code,
						amount,
						taxCategory: taxCat ?? acc.defaultTaxCategory
					});
				}
			}
		}
	}

	if (current) journals.push(current);

	// 借借貸貸バランスチェック
	for (let i = 0; i < journals.length; i++) {
		const j = journals[i];
		if (j.lines.length === 0) {
			warnings.push(`仕訳${i + 1}（${j.date} ${j.description}）: 有効な明細行がありません`);
			continue;
		}
		const debitTotal = j.lines.filter((l) => l.type === 'debit').reduce((s, l) => s + l.amount, 0);
		const creditTotal = j.lines
			.filter((l) => l.type === 'credit')
			.reduce((s, l) => s + l.amount, 0);
		if (debitTotal !== creditTotal) {
			warnings.push(
				`仕訳${i + 1}（${j.date} ${j.description}）: 借方合計 ¥${debitTotal.toLocaleString()} ≠ 貸方合計 ¥${creditTotal.toLocaleString()}`
			);
		}
	}

	return { journals, errors, warnings };
}

/** ParsedJournal を addJournal に渡せる形式に変換 */
export function toJournalEntryData(
	parsed: ParsedJournal
): Omit<JournalEntry, 'id' | 'createdAt' | 'updatedAt'> {
	return {
		date: parsed.date,
		description: parsed.description,
		vendor: parsed.vendor,
		evidenceStatus: 'none',
		lines: parsed.lines.map((l) => ({
			id: crypto.randomUUID(),
			type: l.type,
			accountCode: l.accountCode,
			amount: l.amount,
			taxCategory: l.taxCategory
		})),
		attachments: []
	};
}

/** インポート用テンプレート CSV を生成 */
export function generateTemplateCsv(): string {
	const headers = ['日付', '摘要', '取引先', '借方科目', '借方金額', '貸方科目', '貸方金額', '消費税区分'];
	const examples = [
		['2024-04-01', '事務用品購入', '○○文具', '消耗品費', '1100', '普通預金', '1100', '課仕10%'],
		['2024-04-02', '売上計上', '○○株式会社', '売掛金', '110000', '売上高', '110000', '課売10%'],
		// 複合仕訳（借方1行、貸方2行）
		['2024-04-03', '立替精算', '○○商事', '旅費交通費', '5500', '', '', '課仕10%'],
		['', '', '', '消耗品費', '3300', '', '', '課仕10%'],
		['', '', '', '', '', '未払金', '8800', '']
	];
	const rows = [headers, ...examples];
	return '﻿' + rows.map((r) => r.map((c) => `"${c}"`).join(',')).join('\n');
}

/** 勘定科目コード一覧 CSV を生成 */
export function generateAccountCodesCsv(accounts: Account[]): string {
	const headers = ['カテゴリ', 'コード', '科目名', 'デフォルト消費税区分'];
	const rows = accounts.map((acc) => [
		AccountTypeLabels[acc.type] as string,
		acc.code,
		acc.name,
		acc.defaultTaxCategory ? (TaxCategoryLabels[acc.defaultTaxCategory] ?? '') : ''
	]);
	return '﻿' + [headers, ...rows].map((r) => r.map((c) => `"${c}"`).join(',')).join('\n');
}
