<script lang="ts">
	import { tick } from 'svelte';
	import { base } from '$app/paths';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Textarea } from '$lib/components/ui/textarea/index.js';
	import { Bot, Loader2, Plus, Send, Sparkles, X } from '@lucide/svelte';
	import { getSetting } from '$lib/db';
	import {
		buildSystemPrompt,
		sendChat,
		extractSuggestedJournals,
		stripJournalBlocks,
		type ChatMessage,
		type SuggestedJournal
	} from '$lib/ai/assistant';
	import type { Account, AiSettings } from '$lib/types';
	import { TaxCategoryLabels, type TaxCategory } from '$lib/types';
	import { toast } from 'svelte-sonner';

	interface Props {
		accounts: Account[];
		oncreatejournal: (suggestion: SuggestedJournal) => Promise<void>;
	}

	let { accounts, oncreatejournal }: Props = $props();

	let open = $state(false);
	let aiSettings = $state<AiSettings | null>(null);
	let settingsLoaded = $state(false);
	let input = $state('');
	let isComposing = $state(false);
	let isLoading = $state(false);
	let streamingText = $state('');
	let messages = $state<ChatMessage[]>([]);
	let scrollRef = $state<HTMLDivElement | null>(null);
	let abortController: AbortController | null = null;

	const activeApiKey = $derived.by(() => {
		if (!aiSettings) return '';
		return aiSettings.provider === 'claude'
			? (aiSettings.claudeApiKey ?? '')
			: (aiSettings.geminiApiKey ?? '');
	});

	const providerLabel = $derived(aiSettings?.provider === 'gemini' ? 'Gemini' : 'Claude');

	async function togglePanel() {
		open = !open;
		if (open && !settingsLoaded) {
			aiSettings = (await getSetting('aiSettings')) ?? null;
			settingsLoaded = true;
		}
	}

	async function scrollToBottom() {
		await tick();
		scrollRef?.scrollTo({ top: scrollRef.scrollHeight });
	}

	async function handleSend() {
		const text = input.trim();
		if (!text || isLoading || !aiSettings || !activeApiKey) return;

		input = '';
		messages = [...messages, { role: 'user', content: text }];
		isLoading = true;
		streamingText = '';
		await scrollToBottom();

		abortController = new AbortController();
		try {
			const today = new Date().toISOString().substring(0, 10);
			const systemPrompt = buildSystemPrompt(accounts, today);
			const full = await sendChat({
				provider: aiSettings.provider,
				apiKey: activeApiKey,
				systemPrompt,
				messages,
				onDelta: (delta) => {
					streamingText += delta;
					scrollRef?.scrollTo({ top: scrollRef.scrollHeight });
				},
				signal: abortController.signal
			});
			messages = [...messages, { role: 'assistant', content: full }];
		} catch (e) {
			console.error('AIアシスタントエラー:', e);
			const msg = e instanceof Error ? e.message : 'エラーが発生しました';
			messages = [
				...messages,
				{ role: 'assistant', content: `⚠️ ${msg}\n\nAPIキーが正しいか設定ページでご確認ください。` }
			];
		} finally {
			isLoading = false;
			streamingText = '';
			abortController = null;
			await scrollToBottom();
		}
	}

	function handleKeydown(e: KeyboardEvent) {
		// IME変換中のEnterは無視
		if (e.key === 'Enter' && !e.shiftKey && !isComposing && !(e as KeyboardEvent).isComposing) {
			e.preventDefault();
			handleSend();
		}
	}

	async function handleCreateJournal(suggestion: SuggestedJournal) {
		try {
			await oncreatejournal(suggestion);
			toast.success('仕訳を作成しました');
		} catch (e) {
			const msg = e instanceof Error ? e.message : '仕訳の作成に失敗しました';
			toast.error(msg);
		}
	}

	function debitLines(s: SuggestedJournal) {
		return s.lines.filter((l) => l.type === 'debit');
	}
	function creditLines(s: SuggestedJournal) {
		return s.lines.filter((l) => l.type === 'credit');
	}
	function taxLabel(tax?: string): string {
		if (!tax) return '';
		return TaxCategoryLabels[tax as TaxCategory] ?? '';
	}
</script>

<!-- フローティングボタン -->
<button
	type="button"
	class="fixed right-4 bottom-4 z-30 flex size-12 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-transform hover:scale-105"
	onclick={togglePanel}
	title="AIアシスタント"
>
	{#if open}
		<X class="size-5" />
	{:else}
		<Sparkles class="size-5" />
	{/if}
	<span class="sr-only">AIアシスタントを開く</span>
</button>

<!-- チャットパネル -->
{#if open}
	<div
		class="fixed top-14 right-0 bottom-0 z-20 flex w-full flex-col border-l bg-background shadow-xl sm:w-96"
	>
		<!-- ヘッダー -->
		<div class="flex items-center gap-2 border-b px-4 py-3">
			<Bot class="size-5 text-primary" />
			<div class="flex-1">
				<p class="text-sm font-semibold">AIアシスタント</p>
				<p class="text-xs text-muted-foreground">仕訳の相談（{providerLabel}）</p>
			</div>
			<Button variant="ghost" size="icon" class="size-8" onclick={() => (open = false)}>
				<X class="size-4" />
				<span class="sr-only">閉じる</span>
			</Button>
		</div>

		{#if settingsLoaded && !activeApiKey}
			<!-- APIキー未設定 -->
			<div class="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
				<Sparkles class="size-8 text-muted-foreground" />
				<p class="text-sm font-medium">APIキーが設定されていません</p>
				<p class="text-xs text-muted-foreground">
					設定ページで Claude または Gemini のAPIキーを登録すると、仕訳の相談ができるようになります。
				</p>
				<Button href="{base}/settings" variant="outline" size="sm">設定ページへ</Button>
			</div>
		{:else}
			<!-- メッセージ一覧 -->
			<div bind:this={scrollRef} class="flex-1 space-y-3 overflow-y-auto p-4">
				{#if messages.length === 0 && !isLoading}
					<div class="rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground">
						<p class="mb-1 font-medium">💡 こんな質問ができます</p>
						<ul class="list-disc space-y-0.5 pl-4">
							<li>打ち合わせのカフェ代1,200円はどう仕分ける？</li>
							<li>自宅家賃10万円を事業30%で按分したい</li>
							<li>売上30万円から源泉徴収された入金の仕訳は？</li>
						</ul>
					</div>
				{/if}

				{#each messages as message, i (i)}
					{#if message.role === 'user'}
						<div class="ml-8 rounded-lg bg-primary px-3 py-2 text-sm whitespace-pre-wrap text-primary-foreground">
							{message.content}
						</div>
					{:else}
						{@const journals = extractSuggestedJournals(message.content)}
						{@const displayText = stripJournalBlocks(message.content)}
						<div class="mr-4 space-y-2">
							{#if displayText}
								<div class="rounded-lg bg-muted px-3 py-2 text-sm whitespace-pre-wrap">
									{displayText}
								</div>
							{/if}
							{#each journals as journal, j (j)}
								<div class="rounded-lg border border-primary/30 bg-primary/5 p-3 text-xs">
									<p class="mb-1 font-medium">
										📝 {journal.date} {journal.description}
										{#if journal.vendor}<span class="text-muted-foreground">（{journal.vendor}）</span>{/if}
									</p>
									<div class="mb-2 grid grid-cols-2 gap-2">
										<div>
											<p class="text-muted-foreground">借方</p>
											{#each debitLines(journal) as line, k (k)}
												<p>
													{line.accountName} ¥{line.amount.toLocaleString()}
													{#if taxLabel(line.taxCategory)}<span class="text-muted-foreground">({taxLabel(line.taxCategory)})</span>{/if}
												</p>
											{/each}
										</div>
										<div>
											<p class="text-muted-foreground">貸方</p>
											{#each creditLines(journal) as line, k (k)}
												<p>
													{line.accountName} ¥{line.amount.toLocaleString()}
													{#if taxLabel(line.taxCategory)}<span class="text-muted-foreground">({taxLabel(line.taxCategory)})</span>{/if}
												</p>
											{/each}
										</div>
									</div>
									<Button size="sm" class="h-7 w-full gap-1 text-xs" onclick={() => handleCreateJournal(journal)}>
										<Plus class="size-3" />
										この仕訳を作成
									</Button>
								</div>
							{/each}
						</div>
					{/if}
				{/each}

				{#if isLoading}
					<div class="mr-4 rounded-lg bg-muted px-3 py-2 text-sm whitespace-pre-wrap">
						{#if streamingText}
							{stripJournalBlocks(streamingText) || streamingText}
						{:else}
							<Loader2 class="size-4 animate-spin text-muted-foreground" />
						{/if}
					</div>
				{/if}
			</div>

			<!-- 入力欄 -->
			<div class="border-t p-3">
				<div class="flex items-end gap-2">
					<Textarea
						bind:value={input}
						onkeydown={handleKeydown}
						oncompositionstart={() => (isComposing = true)}
						oncompositionend={() => (isComposing = false)}
						placeholder="仕訳について質問..."
						class="max-h-32 min-h-10 flex-1 resize-none text-sm"
						rows={1}
					/>
					<Button
						size="icon"
						class="size-10 shrink-0"
						disabled={!input.trim() || isLoading}
						onclick={handleSend}
					>
						<Send class="size-4" />
						<span class="sr-only">送信</span>
					</Button>
				</div>
				<p class="mt-1 text-[10px] text-muted-foreground">
					Enterで送信 / Shift+Enterで改行。AIの回答は参考情報です。
				</p>
			</div>
		{/if}
	</div>
{/if}
