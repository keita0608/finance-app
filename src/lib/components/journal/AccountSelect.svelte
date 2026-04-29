<script lang="ts">
	import { tick } from 'svelte';
	import { SvelteSet } from 'svelte/reactivity';
	import * as Dialog from '$lib/components/ui/dialog/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import {
		ChevronDown,
		ChevronsUpDown,
		Receipt,
		Wallet,
		TrendingUp,
		CreditCard,
		Gem,
		Star
	} from '@lucide/svelte';
	import { cn } from '$lib/utils.js';
	import { AccountTypeLabels, type Account, type AccountType } from '$lib/types';

	interface Props {
		accounts: Account[];
		value: string;
		onchange: (code: string) => void;
		placeholder?: string;
		class?: string;
	}

	let {
		accounts,
		value,
		onchange,
		placeholder = '勘定科目を選択',
		class: className
	}: Props = $props();

	let open = $state(false);
	let triggerRef = $state<HTMLButtonElement>(null!);
	// カテゴリの展開状態（お気に入りがある場合はデフォルトで折りたたみ）
	const expandedCategories = new SvelteSet<AccountType>();

	const selectedAccount = $derived(accounts.find((a) => a.code === value));

	// カテゴリの表示順序（フリーランス向け: よく使う順）
	const categoryOrder: AccountType[] = ['expense', 'asset', 'revenue', 'liability', 'equity'];

	// お気に入り科目
	const favoriteAccounts = $derived(accounts.filter((a) => a.isFavorite));
	const hasFavorites = $derived(favoriteAccounts.length > 0);

	// カテゴリ別にグループ化
	const groupedAccounts = $derived(
		categoryOrder.reduce(
			(acc, type) => {
				acc[type] = accounts.filter((a) => a.type === type);
				return acc;
			},
			{} as Record<AccountType, Account[]>
		)
	);

	// カテゴリごとのアイコン
	const categoryIcons: Record<AccountType, typeof Receipt> = {
		expense: Receipt,
		asset: Wallet,
		revenue: TrendingUp,
		liability: CreditCard,
		equity: Gem
	};

	// お気に入りがない場合は全カテゴリを展開（既存の挙動を維持）
	const isCategoryExpanded = $derived.by(() => (type: AccountType) => {
		if (!hasFavorites) return true;
		return expandedCategories.has(type);
	});

	function toggleCategory(type: AccountType) {
		if (expandedCategories.has(type)) {
			expandedCategories.delete(type);
		} else {
			expandedCategories.add(type);
		}
	}

	function closeAndFocusTrigger() {
		open = false;
		tick().then(() => {
			triggerRef?.focus();
		});
	}

	function handleSelect(code: string) {
		onchange(code);
		closeAndFocusTrigger();
	}

	function handleOpenChange(isOpen: boolean) {
		if (!isOpen) {
			expandedCategories.clear();
		}
	}
</script>

<Dialog.Root bind:open onOpenChange={handleOpenChange}>
	<Dialog.Trigger>
		{#snippet child({ props })}
			<Button
				{...props}
				bind:ref={triggerRef}
				variant="outline"
				role="combobox"
				aria-expanded={open}
				class={cn('w-full justify-between font-normal', className)}
			>
				{#if selectedAccount}
					<span class="truncate">{selectedAccount.name}</span>
				{:else}
					<span class="text-muted-foreground">{placeholder}</span>
				{/if}
				<ChevronsUpDown class="ml-2 size-4 shrink-0 opacity-50" />
			</Button>
		{/snippet}
	</Dialog.Trigger>
	<Dialog.Content class="max-h-[90vh] w-full max-w-2xl overflow-y-auto p-4">
		<Dialog.Header class="sr-only">
			<Dialog.Title>勘定科目を選択</Dialog.Title>
		</Dialog.Header>
		<div class="space-y-4">
			<!-- お気に入りセクション -->
			{#if hasFavorites}
				<div>
					<div class="mb-2 flex items-center gap-1.5 rounded bg-amber-50 px-2 py-1.5 dark:bg-amber-950/30">
						<Star class="size-4 fill-amber-400 text-amber-400" />
						<span class="text-sm font-semibold">お気に入り</span>
						<span class="text-xs text-muted-foreground">({favoriteAccounts.length})</span>
					</div>
					<div class="flex flex-wrap gap-1">
						{#each favoriteAccounts as account (account.code)}
							{#if account.isSystem}
								<button
									type="button"
									class={cn(
										'px-2 py-1 text-sm transition-colors',
										value === account.code
											? 'font-medium text-primary underline'
											: 'text-muted-foreground hover:text-foreground'
									)}
									onclick={() => handleSelect(account.code)}
								>
									{account.name}
								</button>
							{:else}
								<button
									type="button"
									class={cn(
										'rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-sm font-medium transition-colors hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:hover:bg-slate-700',
										value === account.code && 'ring-2 ring-primary ring-offset-1'
									)}
									onclick={() => handleSelect(account.code)}
								>
									{account.name}
								</button>
							{/if}
						{/each}
					</div>
				</div>
				<hr class="border-border" />
			{/if}

			<!-- カテゴリ別（お気に入りがある場合は折りたたみ可能） -->
			{#each categoryOrder as type (type)}
				{@const accountsInCategory = groupedAccounts[type]}
				{@const Icon = categoryIcons[type]}
				{@const expanded = isCategoryExpanded(type)}
				{#if accountsInCategory.length > 0}
					<div>
						<!-- カテゴリヘッダー -->
						{#if hasFavorites}
							<button
								type="button"
								class="mb-2 flex w-full items-center gap-1.5 bg-muted px-2 py-1.5 hover:bg-muted/80"
								onclick={() => toggleCategory(type)}
							>
								<Icon class="size-4 text-muted-foreground" />
								<span class="text-sm font-semibold">{AccountTypeLabels[type]}</span>
								<span class="text-xs text-muted-foreground">({accountsInCategory.length})</span>
								<ChevronDown
									class="ml-auto size-4 text-muted-foreground transition-transform {expanded
										? 'rotate-180'
										: ''}"
								/>
							</button>
						{:else}
							<div class="mb-2 flex items-center gap-1.5 bg-muted px-2 py-1.5">
								<Icon class="size-4 text-muted-foreground" />
								<span class="text-sm font-semibold">{AccountTypeLabels[type]}</span>
								<span class="text-xs text-muted-foreground">({accountsInCategory.length})</span>
							</div>
						{/if}

						<!-- 科目グリッド（折りたたみ） -->
						{#if expanded}
							<div class="flex flex-wrap gap-1">
								{#each accountsInCategory as account (account.code)}
									{#if account.isSystem}
										<button
											type="button"
											class={cn(
												'px-2 py-1 text-sm transition-colors',
												value === account.code
													? 'font-medium text-primary underline'
													: 'text-muted-foreground hover:text-foreground'
											)}
											onclick={() => handleSelect(account.code)}
										>
											{account.name}
										</button>
									{:else}
										<button
											type="button"
											class={cn(
												'rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-sm font-medium transition-colors hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:hover:bg-slate-700',
												value === account.code && 'ring-2 ring-primary ring-offset-1'
											)}
											onclick={() => handleSelect(account.code)}
										>
											{account.name}
										</button>
									{/if}
								{/each}
							</div>
						{/if}
					</div>
				{/if}
			{/each}
		</div>
	</Dialog.Content>
</Dialog.Root>
