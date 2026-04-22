<script lang="ts">
	import { goto } from '$app/navigation';
	import { base } from '$app/paths';
	import { login } from '$lib/stores/auth.svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';

	let email = $state('');
	let password = $state('');
	let error = $state('');
	let loading = $state(false);

	async function handleSubmit(e: SubmitEvent) {
		e.preventDefault();
		error = '';
		loading = true;
		try {
			await login(email, password);
			await goto(`${base}/`);
		} catch {
			error = 'メールアドレスまたはパスワードが正しくありません';
		} finally {
			loading = false;
		}
	}
</script>

<svelte:head>
	<title>ログイン - e-shiwake</title>
</svelte:head>

<div class="flex min-h-screen items-center justify-center bg-background">
	<div class="w-full max-w-sm space-y-6 rounded-lg border bg-card p-8 shadow-sm">
		<div class="space-y-1 text-center">
			<h1 class="text-2xl font-bold">e-shiwake</h1>
			<p class="text-sm text-muted-foreground">ログインしてください</p>
		</div>

		<form onsubmit={handleSubmit} class="space-y-4">
			<div class="space-y-2">
				<Label for="email">メールアドレス</Label>
				<Input
					id="email"
					type="email"
					bind:value={email}
					placeholder="example@example.com"
					required
					autocomplete="email"
				/>
			</div>

			<div class="space-y-2">
				<Label for="password">パスワード</Label>
				<Input
					id="password"
					type="password"
					bind:value={password}
					required
					autocomplete="current-password"
				/>
			</div>

			{#if error}
				<p class="text-sm text-destructive">{error}</p>
			{/if}

			<Button type="submit" class="w-full" disabled={loading}>
				{loading ? 'ログイン中...' : 'ログイン'}
			</Button>
		</form>
	</div>
</div>
