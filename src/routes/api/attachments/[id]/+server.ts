/**
 * /api/attachments/[id]
 *
 * GET    - Drive ファイル ID からバイナリをダウンロード
 * DELETE - Drive ファイルを削除
 */

import type { RequestHandler } from './$types';
import { downloadAttachment, deleteFile, getFileMeta } from '$lib/server/drive-client';
import { error } from '@sveltejs/kit';

export const GET: RequestHandler = async ({ params }) => {
	const { id } = params;

	const [buffer, meta] = await Promise.all([downloadAttachment(id), getFileMeta(id)]);

	return new Response(buffer, {
		headers: {
			'Content-Type': meta.mimeType,
			'Content-Disposition': `inline; filename="${encodeURIComponent(meta.name)}"`,
			'Content-Length': String(buffer.length)
		}
	});
};

export const DELETE: RequestHandler = async ({ params }) => {
	const { id } = params;
	await deleteFile(id);
	return new Response(JSON.stringify({ ok: true }), {
		headers: { 'Content-Type': 'application/json' }
	});
};
