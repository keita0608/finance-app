import { getDocs, deleteDoc } from 'firebase/firestore';
import { userCol } from './database';

export async function clearAllTables() {
	const collections = ['accounts', 'journals', 'vendors', 'settings', 'invoices', 'fixed_assets'];
	for (const name of collections) {
		const snap = await getDocs(userCol(name));
		for (const d of snap.docs) await deleteDoc(d.ref);
	}
}
