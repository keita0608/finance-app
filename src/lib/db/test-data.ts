import { saveVendor } from './vendor-repository';
import { addJournal } from './journal-repository';

export async function seedTestData2024(): Promise<number> {
	const testJournals = [
		{
			date: '2024-01-15',
			vendor: 'Amazon',
			description: 'USBケーブル購入',
			debitCode: '5006',
			creditCode: '1002',
			amount: 1980
		},
		{
			date: '2024-02-03',
			vendor: 'スターバックス',
			description: '打ち合わせ コーヒー代',
			debitCode: '5008',
			creditCode: '1001',
			amount: 1200
		},
		{
			date: '2024-03-10',
			vendor: 'JR東日本',
			description: '客先訪問 交通費',
			debitCode: '5005',
			creditCode: '1001',
			amount: 580
		},
		{
			date: '2024-04-20',
			vendor: 'ヨドバシカメラ',
			description: 'マウス購入',
			debitCode: '5006',
			creditCode: '1002',
			amount: 3980
		},
		{
			date: '2024-05-15',
			vendor: '株式会社クライアントA',
			description: 'ウェブサイト制作',
			debitCode: '1003',
			creditCode: '4001',
			amount: 330000
		},
		{
			date: '2024-06-01',
			vendor: 'NTTドコモ',
			description: '携帯電話代 5月分',
			debitCode: '5004',
			creditCode: '1002',
			amount: 8800
		},
		{
			date: '2024-06-30',
			vendor: '株式会社クライアントA',
			description: 'ウェブサイト制作 入金',
			debitCode: '1002',
			creditCode: '1003',
			amount: 330000
		},
		{
			date: '2024-07-10',
			vendor: 'モノタロウ',
			description: '事務用品購入',
			debitCode: '5006',
			creditCode: '1002',
			amount: 2450
		},
		{
			date: '2024-08-25',
			vendor: 'さくらインターネット',
			description: 'サーバー代 年間',
			debitCode: '5004',
			creditCode: '1002',
			amount: 13200
		},
		{
			date: '2024-09-15',
			vendor: '株式会社クライアントB',
			description: 'システム開発',
			debitCode: '1003',
			creditCode: '4001',
			amount: 550000
		},
		{
			date: '2024-10-20',
			vendor: 'Apple',
			description: 'MacBook Air購入',
			debitCode: '1004',
			creditCode: '1002',
			amount: 164800
		},
		{
			date: '2024-11-05',
			vendor: '楽天',
			description: '書籍購入',
			debitCode: '5007',
			creditCode: '1002',
			amount: 3520
		},
		{
			date: '2024-12-10',
			vendor: '株式会社クライアントB',
			description: 'システム開発 入金',
			debitCode: '1002',
			creditCode: '1003',
			amount: 550000
		},
		{
			date: '2024-12-25',
			vendor: '国税庁',
			description: '予定納税 第2期',
			debitCode: '5010',
			creditCode: '1002',
			amount: 50000
		}
	];

	let count = 0;

	for (const data of testJournals) {
		await saveVendor(data.vendor);
		await addJournal({
			date: data.date,
			lines: [
				{ id: crypto.randomUUID(), type: 'debit', accountCode: data.debitCode, amount: data.amount },
				{ id: crypto.randomUUID(), type: 'credit', accountCode: data.creditCode, amount: data.amount }
			],
			vendor: data.vendor,
			description: data.description,
			evidenceStatus: Math.random() > 0.5 ? 'digital' : 'none',
			attachments: []
		});
		count++;
	}

	return count;
}
