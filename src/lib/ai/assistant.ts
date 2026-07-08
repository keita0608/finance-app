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
export function buildSystemPrompt(accounts: Account[], today: string): string {
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
 * メッセージを送信してストリーミングで応答を受け取る
 *
 * @returns 応答の全文
 */
export async function sendChat(options: {
	provider: AiProvider;
	apiKey: string;
	systemPrompt: string;
	messages: ChatMessage[];
	onDelta: (text: string) => void;
	signal?: AbortSignal;
}): Promise<string> {
	const { provider, apiKey, systemPrompt, messages, onDelta, signal } = options;
	if (provider === 'claude') {
		return sendClaude(apiKey, systemPrompt, messages, onDelta, signal);
	}
	return sendGemini(apiKey, systemPrompt, messages, onDelta, signal);
}

async function sendClaude(
	apiKey: string,
	systemPrompt: string,
	messages: ChatMessage[],
	onDelta: (text: string) => void,
	signal?: AbortSignal
): Promise<string> {
	const client = new Anthropic({
		apiKey,
		dangerouslyAllowBrowser: true // BYOK: ユーザー自身のキーをユーザーのブラウザで使用
	});

	const stream = client.messages.stream(
		{
			model: CLAUDE_MODEL,
			max_tokens: 16000,
			thinking: { type: 'adaptive' },
			system: [
				{
					type: 'text',
					text: systemPrompt,
					cache_control: { type: 'ephemeral' } // 科目リスト等の共通プレフィックスをキャッシュ
				}
			],
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
	messages: ChatMessage[],
	onDelta: (text: string) => void,
	signal?: AbortSignal
): Promise<string> {
	const ai = new GoogleGenAI({ apiKey });

	const contents = messages.map((m) => ({
		role: m.role === 'assistant' ? ('model' as const) : ('user' as const),
		parts: [{ text: m.content }]
	}));

	const stream = await ai.models.generateContentStream({
		model: GEMINI_MODEL,
		contents,
		config: {
			systemInstruction: systemPrompt,
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
