<script lang="ts">
	import { onMount } from 'svelte';
	import * as Card from '$lib/components/ui/card/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Textarea } from '$lib/components/ui/textarea/index.js';
	import { BookOpen, RotateCcw } from '@lucide/svelte';
	import { getSetting, setSetting } from '$lib/db';
	import { DEFAULT_NAMING_RULES } from '$lib/constants/naming-rules';
	import { toast } from 'svelte-sonner';

	let rules = $state(DEFAULT_NAMING_RULES);
	let isSaving = $state(false);

	onMount(async () => {
		const saved = await getSetting('journalNamingRules');
		if (saved) rules = saved;
	});

	async function handleSave() {
		isSaving = true;
		try {
			await setSetting('journalNamingRules', rules.trim() || DEFAULT_NAMING_RULES);
			toast.success('仕訳ルールを保存しました');
		} catch (e) {
			console.error(e);
			toast.error('保存に失敗しました');
		} finally {
			isSaving = false;
		}
	}

	function handleReset() {
		rules = DEFAULT_NAMING_RULES;
		toast.info('初期ルールに戻しました（保存ボタンで確定）');
	}
</script>

<Card.Root>
	<Card.Header>
		<Card.Title class="flex items-center gap-2">
			<BookOpen class="size-5" />
			仕訳ルール（摘要の命名規則）
		</Card.Title>
		<Card.Description>
			AIアシスタントはこのルールに従って摘要を作成します。新しい取引パターンが発生したら、ここに追記してください。
		</Card.Description>
	</Card.Header>
	<Card.Content class="space-y-3">
		<Textarea bind:value={rules} rows={18} class="font-mono text-xs leading-relaxed" />
		<div class="flex gap-2">
			<Button onclick={handleSave} disabled={isSaving}>
				{isSaving ? '保存中...' : '保存'}
			</Button>
			<Button variant="outline" onclick={handleReset}>
				<RotateCcw class="mr-2 size-4" />
				初期ルールに戻す
			</Button>
		</div>
	</Card.Content>
</Card.Root>
