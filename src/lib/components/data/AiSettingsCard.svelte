<script lang="ts">
	import { onMount } from 'svelte';
	import * as Card from '$lib/components/ui/card/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import * as RadioGroup from '$lib/components/ui/radio-group/index.js';
	import { Bot, ExternalLink } from '@lucide/svelte';
	import { getSetting, setSetting } from '$lib/db';
	import type { AiProvider, AiSettings } from '$lib/types';
	import { toast } from 'svelte-sonner';

	let provider = $state<AiProvider>('claude');
	let claudeApiKey = $state('');
	let geminiApiKey = $state('');
	let isSaving = $state(false);

	onMount(async () => {
		const saved = await getSetting('aiSettings');
		if (saved) {
			provider = saved.provider ?? 'claude';
			claudeApiKey = saved.claudeApiKey ?? '';
			geminiApiKey = saved.geminiApiKey ?? '';
		}
	});

	async function handleSave() {
		isSaving = true;
		try {
			const settings: AiSettings = {
				provider,
				claudeApiKey: claudeApiKey.trim(),
				geminiApiKey: geminiApiKey.trim()
			};
			await setSetting('aiSettings', settings);
			toast.success('AIアシスタント設定を保存しました');
		} catch (e) {
			console.error(e);
			toast.error('設定の保存に失敗しました');
		} finally {
			isSaving = false;
		}
	}
</script>

<Card.Root>
	<Card.Header>
		<Card.Title class="flex items-center gap-2">
			<Bot class="size-5" />
			AIアシスタント
		</Card.Title>
		<Card.Description>
			仕訳帳のチャットパネルで仕訳の相談ができます。ご自身のAPIキーを登録してください（キーはあなたのアカウントにのみ保存されます）。
		</Card.Description>
	</Card.Header>
	<Card.Content class="space-y-4">
		<!-- プロバイダ選択 -->
		<div class="space-y-2">
			<Label>使用するAI</Label>
			<RadioGroup.Root bind:value={provider} class="flex gap-6">
				<div class="flex items-center gap-2">
					<RadioGroup.Item value="claude" id="ai-claude" />
					<Label for="ai-claude" class="font-normal">Claude（Anthropic）</Label>
				</div>
				<div class="flex items-center gap-2">
					<RadioGroup.Item value="gemini" id="ai-gemini" />
					<Label for="ai-gemini" class="font-normal">Gemini（Google）</Label>
				</div>
			</RadioGroup.Root>
		</div>

		<!-- Claude APIキー -->
		<div class="space-y-1.5">
			<Label for="claude-key">Claude APIキー</Label>
			<Input
				id="claude-key"
				type="password"
				bind:value={claudeApiKey}
				placeholder="sk-ant-..."
				autocomplete="off"
			/>
			<p class="text-xs text-muted-foreground">
				<a
					href="https://platform.claude.com/"
					target="_blank"
					rel="noopener noreferrer"
					class="inline-flex items-center gap-0.5 text-primary hover:underline"
				>
					Claude Platform<ExternalLink class="size-3" />
				</a>
				でAPIキーを取得できます
			</p>
		</div>

		<!-- Gemini APIキー -->
		<div class="space-y-1.5">
			<Label for="gemini-key">Gemini APIキー</Label>
			<Input
				id="gemini-key"
				type="password"
				bind:value={geminiApiKey}
				placeholder="AIza..."
				autocomplete="off"
			/>
			<p class="text-xs text-muted-foreground">
				<a
					href="https://aistudio.google.com/apikey"
					target="_blank"
					rel="noopener noreferrer"
					class="inline-flex items-center gap-0.5 text-primary hover:underline"
				>
					Google AI Studio<ExternalLink class="size-3" />
				</a>
				でAPIキーを取得できます
			</p>
		</div>

		<div
			class="rounded-md border border-amber-300 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200"
		>
			APIの利用料金はキーの持ち主（あなた）のアカウントに請求されます。キーは他人と共有しないでください。
		</div>

		<Button onclick={handleSave} disabled={isSaving}>
			{isSaving ? '保存中...' : '保存'}
		</Button>
	</Card.Content>
</Card.Root>
