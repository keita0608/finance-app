/**
 * POST /api/attachments
 *
 * 証憑ファイル（PDF など）を Google Drive にアップロードする。
 * multipart/form-data で受け取る:
 *   file  - ファイル本体
 *   year  - 保存先年度（数値文字列）
 *   name  - 保存ファイル名
 */

import type { RequestHandler } from './$types';
import { uploadAttachment } from '$lib/server/drive-client';
import { json, error } from '@sveltejs/kit';

export const POST: RequestHandler = async ({ request }) => {
	const formData = await request.formData();
	const file = formData.get('file') as File | null;
	const yearStr = formData.get('year') as string | null;
	const name = formData.get('name') as string | null;

	if (!file || !yearStr || !name) throw error(400, 'file, year, name は必須です');

	const year = parseInt(yearStr, 10);
	if (isNaN(year)) throw error(400, 'year は数値である必要があります');

	const arrayBuffer = await file.arrayBuffer();
	const buffer = Buffer.from(arrayBuffer);
	const fileId = await uploadAttachment(name, year, buffer, file.type);

	return json({ fileId });
};
