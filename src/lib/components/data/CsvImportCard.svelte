<script lang="ts">
	import * as Card from '$lib/components/ui/card/index.js';
	import * as Alert from '$lib/components/ui/alert/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import {
		FileSpreadsheet,
		Upload,
		Download,
		AlertCircle,
		TriangleAlert,
		CheckCircle,
		Info
	} from '@lucide/svelte';
	import { getAllAccounts } from '$lib/db/account-repository';
	import { addJournal } from '$lib/db/journal-repository';
	import { getAvailableYears } from '$lib/db';
	import {
		parseCsvJournals,
		toJournalEntryData,
		generateTemplateCsv,
		generateAccountCodesCsv,
		type CsvParseResult
	} from '$lib/utils/csv-journal-import';
	import type { Account } from '$lib/types';
	import { TaxCategoryLabels } from '$lib/types';
	import { toast } from 'svelte-sonner';

	interface Props {
		onyearschange?: (years: number[]) => void;
	}

	let { onyearschange }: Props = $props();

	let isDragging = $state(false);
	let isParsing = $state(false);
	let isImporting = $state(false);
	let parseResult = $state<CsvParseResult | null>(null);
	let accounts = $state<Account[]>([]);
	let fileInput: HTMLInputElement | undefined = $state();

	async function ensureAccounts() {
		if (accounts.length === 0) {
			accounts = await getAllAccounts();
		}
	}

	async function processFile(file: File) {
		if (!file.name.toLowerCase().endsWith('.csv')) {
			toast.error('CSVファイルを選択してください');
			return;
		}
		await ensureAccounts();
		isParsing = true;
		parseResult = null;
		try {
			const text = await file.text();
			parseResult = parseCsvJournals(text, accounts);
		} catch {
			toast.error('ファイルの読み込みに失敗しました');
		} finally {
			isParsing = false;
		}
	}

	function handleDrop(e: DragEvent) {
		e.preventDefault();
		isDragging = false;
		const file = e.dataTransfer?.files[0];
		if (file) processFile(file);
	}

	function handleDragOver(e: DragEvent) {
		e.preventDefault();
		isDragging = true;
	}

	function handleDragLeave() {
		isDragging = false;
	}

	function handleFileChange(e: Event) {
		const file = (e.target as HTMLInputElement).files?.[0];
		if (file) processFile(file);
		// 同じファイルを再選択できるようリセット
		(e.target as HTMLInputElement).value = '';
	}

	async function handleImport() {
		if (!parseResult || parseResult.errors.length > 0) return;
		const validJournals = parseResult.journals.filter((j) => j.lines.length > 0);
		if (validJournals.length === 0) return;

		isImporting = true;
		try {
			for (const j of validJournals) {
				await addJournal(toJournalEntryData(j));
			}
			toast.success(`${validJournals.length}件の仕訳をインポートしました`);
			parseResult = null;
			const years = await getAvailableYears();
			onyearschange?.(years);
		} catch (e) {
			console.error(e);
			toast.error('インポートに失敗しました');
		} finally {
			isImporting = false;
		}
	}

	function downloadTemplate() {
		const csv = generateTemplateCsv();
		triggerDownload(csv, '仕訳インポートテンプレート.csv');
	}

	async function downloadAccountCodes() {
		await ensureAccounts();
		const csv = generateAccountCodesCsv(accounts);
		triggerDownload(csv, '勘定科目コード一覧.csv');
	}

	function triggerDownload(csvContent: string, filename: string) {
		const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = filename;
		a.click();
		URL.revokeObjectURL(url);
	}

	const validJournals = $derived(parseResult?.journals.filter((j) => j.lines.length > 0) ?? []);
	const canImport = $derived(
		parseResult !== null && parseResult.errors.length === 0 && validJournals.length > 0
	);
</script>

<Card.Root>
	<Card.Header>
		<Card.Title class="flex items-center gap-2">
			<FileSpreadsheet class="size-5" />
			CSVインポート
		</Card.Title>
		<Card.Description>ExcelなどのCSVファイルから仕訳を一括登録します。添付ファイルは別途手動で追加してください。</Card.Description>
	</Card.Header>
	<Card.Content class="space-y-4">
		<!-- ダウンロードボタン群 -->
		<div class="flex flex-wrap gap-2">
			<Button variant="outline" size="sm" onclick={downloadTemplate}>
				<Download class="mr-2 size-4" />
				テンプレートCSV
			</Button>
			<Button variant="outline" size="sm" onclick={downloadAccountCodes}>
				<Download class="mr-2 size-4" />
				勘定科目コード一覧
			</Button>
		</div>

		<!-- 使い方メモ -->
		<div class="rounded-md border border-blue-200 bg-blue-50 p-3 text-xs text-blue-800 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-200">
			<p class="mb-1 font-medium flex items-center gap-1"><Info class="size-3.5" />CSVの作り方</p>
			<ul class="list-disc pl-4 space-y-0.5">
				<li>借方科目・貸方科目は<strong>科目名</strong>または<strong>コード番号</strong>で入力</li>
				<li>複合仕訳は2行目以降の「日付」を空欄にして続けて記入</li>
				<li>消費税区分は省略可（科目のデフォルト区分が適用されます）</li>
				<li>Excelで編集後「CSV UTF-8」形式で保存してください</li>
			</ul>
		</div>

		<!-- ファイルドロップゾーン -->
		<div
			role="button"
			tabindex="0"
			class="flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed p-8 text-center transition-colors
				{isDragging
				? 'border-primary bg-primary/5'
				: 'border-border hover:border-primary/50 hover:bg-muted/30'}"
			ondrop={handleDrop}
			ondragover={handleDragOver}
			ondragleave={handleDragLeave}
			onclick={() => fileInput?.click()}
			onkeydown={(e) => e.key === 'Enter' && fileInput?.click()}
		>
			<Upload class="mb-2 size-8 text-muted-foreground" />
			<p class="text-sm font-medium">CSVファイルをドロップ</p>
			<p class="text-xs text-muted-foreground">またはクリックして選択</p>
		</div>
		<input
			bind:this={fileInput}
			type="file"
			accept=".csv"
			class="hidden"
			onchange={handleFileChange}
		/>

		<!-- パース中 -->
		{#if isParsing}
			<p class="text-sm text-muted-foreground">解析中...</p>
		{/if}

		<!-- 結果表示 -->
		{#if parseResult}
			<!-- エラー -->
			{#if parseResult.errors.length > 0}
				<Alert.Root variant="destructive">
					<AlertCircle class="size-4" />
					<Alert.Title>エラー ({parseResult.errors.length}件)</Alert.Title>
					<Alert.Description>
						<ul class="mt-1 list-disc pl-4 text-xs space-y-0.5">
							{#each parseResult.errors as err (err)}
								<li>{err}</li>
							{/each}
						</ul>
					</Alert.Description>
				</Alert.Root>
			{/if}

			<!-- 警告 -->
			{#if parseResult.warnings.length > 0}
				<Alert.Root class="border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950">
					<TriangleAlert class="size-4 text-amber-600 dark:text-amber-400" />
					<Alert.Title class="text-amber-800 dark:text-amber-200">警告 ({parseResult.warnings.length}件)</Alert.Title>
					<Alert.Description class="text-amber-700 dark:text-amber-300">
						<ul class="mt-1 list-disc pl-4 text-xs space-y-0.5">
							{#each parseResult.warnings as w (w)}
								<li>{w}</li>
							{/each}
						</ul>
					</Alert.Description>
				</Alert.Root>
			{/if}

			<!-- プレビュー -->
			{#if validJournals.length > 0}
				<div>
					<p class="mb-2 text-sm font-medium flex items-center gap-1.5">
						<CheckCircle class="size-4 text-green-500" />
						{validJournals.length}件の仕訳を読み込みました
						{#if parseResult.errors.length === 0}
							<span class="text-muted-foreground text-xs">（プレビュー: 最大10件）</span>
						{/if}
					</p>
					<div class="rounded-md border overflow-x-auto">
						<table class="w-full text-xs">
							<thead class="bg-muted/50">
								<tr>
									<th class="px-3 py-2 text-left font-medium">日付</th>
									<th class="px-3 py-2 text-left font-medium">摘要</th>
									<th class="px-3 py-2 text-left font-medium">取引先</th>
									<th class="px-3 py-2 text-right font-medium">借方</th>
									<th class="px-3 py-2 text-right font-medium">貸方</th>
								</tr>
							</thead>
							<tbody class="divide-y">
								{#each validJournals.slice(0, 10) as j (j.date + j.description + j.vendor)}
									{@const debitLines = j.lines.filter((l) => l.type === 'debit')}
									{@const creditLines = j.lines.filter((l) => l.type === 'credit')}
									{@const maxLines = Math.max(debitLines.length, creditLines.length)}
									{#each Array.from({ length: maxLines }, (_, k) => k) as k (k)}
										<tr class="hover:bg-muted/30">
											<td class="px-3 py-1.5 font-mono text-muted-foreground">
												{k === 0 ? j.date.substring(5).replace('-', '/') : ''}
											</td>
											<td class="px-3 py-1.5">
												{k === 0 ? j.description : ''}
											</td>
											<td class="px-3 py-1.5 text-muted-foreground">
												{k === 0 ? j.vendor : ''}
											</td>
											<td class="px-3 py-1.5 text-right font-mono">
												{#if debitLines[k]}
													{@const dl = debitLines[k]}
													<span class="text-foreground">¥{dl.amount.toLocaleString()}</span>
													{#if dl.taxCategory}
														<span class="ml-1 text-muted-foreground">({TaxCategoryLabels[dl.taxCategory]})</span>
													{/if}
												{/if}
											</td>
											<td class="px-3 py-1.5 text-right font-mono">
												{#if creditLines[k]}
													{@const cl = creditLines[k]}
													<span class="text-foreground">¥{cl.amount.toLocaleString()}</span>
													{#if cl.taxCategory}
														<span class="ml-1 text-muted-foreground">({TaxCategoryLabels[cl.taxCategory]})</span>
													{/if}
												{/if}
											</td>
										</tr>
									{/each}
								{/each}
								{#if validJournals.length > 10}
									<tr>
										<td colspan={5} class="px-3 py-2 text-center text-muted-foreground">
											… 他 {validJournals.length - 10} 件
										</td>
									</tr>
								{/if}
							</tbody>
						</table>
					</div>
				</div>

				<!-- インポートボタン -->
				<Button onclick={handleImport} disabled={!canImport || isImporting} class="w-full">
					{#if isImporting}
						インポート中...
					{:else}
						{validJournals.length}件をインポート
					{/if}
				</Button>
			{/if}
		{/if}
	</Card.Content>
</Card.Root>
