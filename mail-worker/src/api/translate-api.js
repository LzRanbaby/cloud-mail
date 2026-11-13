import app from '../hono/hono';
import userContext from '../security/user-context';
import result from '../model/result';
import emailUtils from '../utils/email-utils';

// Translate an email body with Cloudflare Workers AI (m2m100-1.2b).
// No key needed: the AI binding lives on the Worker, so content never
// leaves Cloudflare. Free tier: 10,000 Neurons/day, hard stop at 00:00 UTC.
const MODEL = '@cf/meta/m2m100-1.2b';
const MAX_CHARS = 20000;
const CHUNK_CHARS = 1200;

function isMostlyChinese(text) {
	const cjk = (text.match(/[\u4e00-\u9fff]/g) || []).length;
	const latin = (text.match(/[A-Za-z]/g) || []).length;
	return cjk > latin;
}

function splitChunks(text, size) {
	const parts = text.split(/(?<=[\n.!?。！？])\s*/).filter(Boolean);
	const chunks = [];
	let cur = '';
	const push = (s) => {
		for (let i = 0; i < s.length; i += size) chunks.push(s.slice(i, i + size));
	};
	for (const p of parts) {
		if (cur && (cur + p).length > size) { push(cur); cur = p; }
		else cur += p;
	}
	if (cur) push(cur);
	return chunks.length ? chunks : [text];
}

app.post('/translate', async (c) => {
	userContext.getUserId(c);
	const { text } = await c.req.json();
	const raw = String(text || '');
	const plain = ((emailUtils.htmlToText(raw) || '').trim() || emailUtils.formatText(raw).trim()).slice(0, MAX_CHARS);
	if (!plain) return c.json(result.ok({ translatedText: '', sourceLang: '', targetLang: '' }));
	const sourceLang = isMostlyChinese(plain) ? 'zh' : 'en';
	const targetLang = sourceLang === 'zh' ? 'en' : 'zh';
	try {
		const ai = c.env.ai;
		const out = [];
		for (const chunk of splitChunks(plain, CHUNK_CHARS)) {
			const res = await ai.run(MODEL, { text: chunk, source_lang: sourceLang, target_lang: targetLang });
			out.push(res?.translated_text || '');
		}
		return c.json(result.ok({ translatedText: out.join('\n'), sourceLang, targetLang }));
	} catch (e) {
		console.error('translate failed: ', e);
		return c.json(result.fail('translate failed'));
	}
});
