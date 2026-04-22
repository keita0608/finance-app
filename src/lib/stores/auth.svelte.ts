import { browser } from '$app/environment';
import { auth } from '$lib/firebase';
import { onAuthStateChanged, signInWithEmailAndPassword, signOut, type User } from 'firebase/auth';

let currentUser = $state<User | null>(null);
let authLoading = $state(true);

if (browser) {
	onAuthStateChanged(auth, (user) => {
		currentUser = user;
		authLoading = false;
	});
} else {
	authLoading = false;
}

export function useAuth() {
	return {
		get user() {
			return currentUser;
		},
		get loading() {
			return authLoading;
		},
		get uid() {
			return currentUser?.uid ?? null;
		}
	};
}

export function getUid(): string {
	const uid = auth.currentUser?.uid;
	if (!uid) throw new Error('ログインが必要です');
	return uid;
}

export async function login(email: string, password: string): Promise<void> {
	await signInWithEmailAndPassword(auth, email, password);
}

export async function logout(): Promise<void> {
	await signOut(auth);
}
