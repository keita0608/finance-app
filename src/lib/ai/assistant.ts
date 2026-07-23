/**
 * AIアシスタント クライアント
 *
 * ブラウザから直接 Claude / Gemini API を呼び出す（BYOK方式）。
 * APIキーはユーザー自身のものを設定画面で登録し、Firestoreの
 * ユーザー設定（users/{uid}/settings/aiSettings）に保存する。
 */

import Anthropic from '@anthropic-ai/sdk';
import { GoogleGenAI } from '@google/genai';
import type { Account, AiProvider, JournalEntry, JournalLine, TaxCategory } from '$lib/types';
import { DEFAULT_NAMING_RULES } from '$lib/constants/naming-rules';
import { AccountTypeLabels, TaxCategoryLabels } from '$lib/types';

export interface ChatMessage {
	role: 'user' | 'assistant';
	content: string;
}

/** AIが提案する仕訳（レスポンス内の ```json:journal ブロック） */
export interface SuggestedJournal {
	date: string;
	description: string;
	vendor: string;
	lines: Array<{
		type: 'debit' | 'credit';
		accountName: string;
		amount: number;
		taxCategory?: string;
	}>;
}

const CLAUDE_MODEL = 'claude-opus-4-8';
const GEMINI_MODEL = 'gemini-2.5-flash';

/**
 * 勘定科目マスタと複式簿記ルールからシステムプロンプトを構築
 */
export function buildSystemPrompt(
	accounts: Account[],
	today: string,
	namingRules?: string
): string {
	const accountList = accounts
		.map((a) => {
			const tax = a.defaultTaxCategory ? `（デフォルト税区分: ${TaxCategoryLabels[a.defaultTaxCategory]}）` : '';
			return `- ${a.code} ${a.name} [${AccountTypeLabels[a.type]}]${tax}`;
		})
		.join('\n');

	return `あなたは日本のフリーランス・個人事業主向け会計アプリ「e-shiwake」に組み込まれた経理アシスタントです。
ユーザーの仕訳（複式簿記）に関する相談に、簡潔かつ正確に答えてください。

## 前提
- 青色申告を行う個人事業主が対象
- 税込経理方式
- 今日の日付: ${today}

## 利用可能な勘定科目（この中から選ぶこと）
${accountList}

## 消費税区分の値（taxCategoryに使う値）
- sales_10: 課税売上10% / sales_8: 課税売上8%
- purchase_10: 課税仕入10% / purchase_8: 課税仕入8%（軽減税率: 飲食料品など）
- exempt: 非課税 / out_of_scope: 不課税 / na: 対象外（事業主勘定等）

## 摘要の命名ルール（仕訳提案時は必ず従うこと）
${namingRules ?? DEFAULT_NAMING_RULES}

## 個人事業主特有の記帳ルール（重要）
- **事業用口座の預金利息**: 利子所得（源泉分離課税で完結）であり事業所得ではないため、「受取利息」は使わず「貸方: 事業主借」で記帳する。源泉徴収後の入金額のみを計上し、税額をグロスアップしない
  - 例: 利息29円入金 → 借方: 普通預金 29 ／ 貸方: 事業主借 29
- **所得税・住民税・国民健康保険料・国民年金の支払い**: 経費にならない。「借方: 事業主貸」で記帳する
- **生活費の引き出し・私的支出**: 「借方: 事業主貸」
- **プライベート資金からの事業経費の立替**: 「貸方: 事業主借」
- 個人への報酬支払いで源泉徴収された場合の預り分は「事業主貸」ではなく源泉徴収税として適切に処理する

## 回答ルール
1. 仕訳の提案が可能な場合は、説明のあとに必ず以下の形式のJSONブロックを1つ添えること:

\`\`\`json:journal
{
  "date": "YYYY-MM-DD",
  "description": "摘要",
  "vendor": "取引先名（不明なら空文字）",
  "lines": [
    { "type": "debit", "accountName": "科目名", "amount": 金額, "taxCategory": "purchase_10" },
    { "type": "credit", "accountName": "科目名", "amount": 金額 }
  ]
}
\`\`\`

2. accountName は上記の勘定科目リストにある科目名を正確に使うこと
3. 借方合計と貸方合計は必ず一致させること
4. 金額が不明な場合は質問し、JSONブロックは出さないこと
5. 家事按分・源泉徴収など複合仕訳にも対応すること（linesを複数行にする）
6. 税務の断定的な判断が必要な場合は「最終判断は税理士・税務署に確認してください」と添えること
7. 回答は日本語で、簡潔に`;
}

/**
 * 過去の仕訳からAI用の参考コンテキストを構築（新しい順・最大limit件）
 *
 * ユーザーの仕訳パターン（科目の使い方・摘要の書き方）をAIに学習させるために
 * リクエストごとに注入する。キャッシュ対象の安定プレフィックス（システムプロンプト）
 * とは分離して渡すこと。
 */
export function buildJournalContext(
	journals: JournalEntry[],
	accounts: Account[],
	limit = 100
): string {
	if (journals.length === 0) return '';
	const nameOf = (code: string) => accounts.find((a) => a.code === code)?.name ?? code;
	const fmtLines = (j: JournalEntry, type: 'debit' | 'credit') =>
		j.lines
			.filter((l) => l.type === type && l.accountCode)
			.map((l) => `${nameOf(l.accountCode)}${l.amount.toLocaleString()}`)
			.join('+');

	const rows = [...journals]
		.sort((a, b) => b.date.localeCompare(a.date))
		.slice(0, limit)
		.map((j) => `${j.date}|${j.description}|${j.vendor}|借:${fmtLines(j, 'debit')}|貸:${fmtLines(j, 'credit')}`);

	return `## このユーザーの過去の仕訳例（新しい順・最大${limit}件）
同様の取引を相談されたら、過去の仕訳と同じ勘定科目・摘要のパターンで提案してください。
ただし、過去の仕訳が会計・税務上誤っている場合（例: 預金利息を受取利息で計上している等、
「個人事業主特有の記帳ルール」に反するもの）はそれを踏襲せず、正しい仕訳を提案した上で
過去の仕訳にも同様の誤りがある可能性を指摘してください。
形式: 日付|摘要|取引先|借方|貸方

${rows.join('\n')}`;
}

/**
 * メッセージを送信してストリーミングで応答を受け取る
 *
 * @returns 応答の全文
 */
export async function sendChat(options: {
	provider: AiProvider;
	apiKey: string;
	systemPrompt: string;
	journalContext?: string;
	messages: ChatMessage[];
	onDelta: (text: string) => void;
	signal?: AbortSignal;
}): Promise<string> {
	const { provider, apiKey, systemPrompt, journalContext, messages, onDelta, signal } = options;
	if (provider === 'claude') {
		return sendClaude(apiKey, systemPrompt, journalContext, messages, onDelta, signal);
	}
	return sendGemini(apiKey, systemPrompt, journalContext, messages, onDelta, signal);
}

async function sendClaude(
	apiKey: string,
	systemPrompt: string,
	journalContext: string | undefined,
	messages: ChatMessage[],
	onDelta: (text: string) => void,
	signal?: AbortSignal
): Promise<string> {
	const client = new Anthropic({
		apiKey,
		dangerouslyAllowBrowser: true // BYOK: ユーザー自身のキーをユーザーのブラウザで使用
	});

	// 安定部分（ルール＋科目リスト）はキャッシュ、過去仕訳（都度変化）はキャッシュ境界の後ろに置く
	const system: Anthropic.TextBlockParam[] = [
		{
			type: 'text',
			text: systemPrompt,
			cache_control: { type: 'ephemeral' }
		}
	];
	if (journalContext) {
		system.push({ type: 'text', text: journalContext });
	}

	const stream = client.messages.stream(
		{
			model: CLAUDE_MODEL,
			max_tokens: 16000,
			thinking: { type: 'adaptive' },
			system,
			messages: messages.map((m) => ({ role: m.role, content: m.content }))
		},
		{ signal }
	);

	stream.on('text', (delta) => onDelta(delta));

	const final = await stream.finalMessage();
	if (final.stop_reason === 'refusal') {
		throw new Error('この内容には回答できませんでした。表現を変えてお試しください。');
	}
	return final.content
		.filter((b) => b.type === 'text')
		.map((b) => b.text)
		.join('');
}

async function sendGemini(
	apiKey: string,
	systemPrompt: string,
	journalContext: string | undefined,
	messages: ChatMessage[],
	onDelta: (text: string) => void,
	signal?: AbortSignal
): Promise<string> {
	const ai = new GoogleGenAI({ apiKey });

	const contents = messages.map((m) => ({
		role: m.role === 'assistant' ? ('model' as const) : ('user' as const),
		parts: [{ text: m.content }]
	}));

	const systemInstruction = journalContext
		? `${systemPrompt}\n\n${journalContext}`
		: systemPrompt;

	const stream = await ai.models.generateContentStream({
		model: GEMINI_MODEL,
		contents,
		config: {
			systemInstruction,
			abortSignal: signal
		}
	});

	let full = '';
	for await (const chunk of stream) {
		const text = chunk.text;
		if (text) {
			full += text;
			onDelta(text);
		}
	}
	return full;
}

/**
 * 応答テキストから仕訳提案（```json:journal ブロック）を抽出
 */
export function extractSuggestedJournals(text: string): SuggestedJournal[] {
	const results: SuggestedJournal[] = [];
	const regex = /```json:journal\s*\n([\s\S]*?)```/g;
	let match;
	while ((match = regex.exec(text)) !== null) {
		try {
			const parsed = JSON.parse(match[1]) as SuggestedJournal;
			if (parsed.date && Array.isArray(parsed.lines) && parsed.lines.length >= 2) {
				results.push(parsed);
			}
		} catch {
			// パース失敗したブロックは無視
		}
	}
	return results;
}

/**
 * 表示用: json:journal ブロックを除いたテキスト
 */
export function stripJournalBlocks(text: string): string {
	return text.replace(/```json:journal\s*\n[\s\S]*?```/g, '').trim();
}

const VALID_TAX_CATEGORIES = new Set([
	'sales_10',
	'sales_8',
	'purchase_10',
	'purchase_8',
	'exempt',
	'out_of_scope',
	'na'
]);

/**
 * 仕訳提案を JournalEntry の登録データに変換
 *
 * @throws 科目名が勘定科目マスタに見つからない場合
 */
export function suggestionToJournalData(
	suggestion: SuggestedJournal,
	accounts: Account[]
): Omit<JournalEntry, 'id' | 'createdAt' | 'updatedAt'> {
	const lines: JournalLine[] = suggestion.lines.map((l) => {
		const account =
			accounts.find((a) => a.name === l.accountName) ??
			accounts.find((a) => a.name.includes(l.accountName) || l.accountName.includes(a.name));
		if (!account) {
			throw new Error(`勘定科目「${l.accountName}」が見つかりません`);
		}
		const taxCategory = VALID_TAX_CATEGORIES.has(l.taxCategory ?? '')
			? (l.taxCategory as TaxCategory)
			: account.defaultTaxCategory;
		return {
			id: crypto.randomUUID(),
			type: l.type,
			accountCode: account.code,
			amount: l.amount,
			taxCategory
		};
	});

	return {
		date: suggestion.date,
		description: suggestion.description ?? '',
		vendor: suggestion.vendor ?? '',
		evidenceStatus: 'none',
		attachments: [],
		lines
	};
}
