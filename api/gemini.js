// Vercel 서버 함수: 로그인한 사용자의 요청만 받아 Google AI Studio(Gemini) API로 전달해요.
// 필요한 환경 변수 (Vercel → Project → Settings → Environment Variables)
//   GEMINI_API_KEY   : Google AI Studio에서 만든 API 키
//   FIREBASE_API_KEY : firebase-config.js 의 apiKey 와 같은 값 (로그인 확인용)
//   GEMINI_MODEL     : (선택) 기본값 gemini-3.8-flash
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST만 받아요" });
  const key = process.env.GEMINI_API_KEY;
  const fbKey = process.env.FIREBASE_API_KEY;
  if (!key || !fbKey) return res.status(500).json({ error: "서버 환경 변수(GEMINI_API_KEY, FIREBASE_API_KEY)가 설정되지 않았어요." });

  // 1) Firebase 로그인 토큰 확인
  const idToken = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  if (!idToken) return res.status(401).json({ error: "로그인이 필요해요." });
  try {
    const v = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${fbKey}`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ idToken })
    });
    if (!v.ok) return res.status(401).json({ error: "로그인 정보가 만료됐어요. 다시 로그인해 주세요." });
  } catch {
    return res.status(502).json({ error: "로그인을 확인하지 못했어요." });
  }

  // 2) Gemini 호출
  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = {}; } }
  const { prompt = "", images = [], json = false } = body || {};
  if (!prompt) return res.status(400).json({ error: "prompt가 비어 있어요." });
  if (images.length > 6) return res.status(413).json({ error: "이미지는 한 번에 6장까지예요." });

  const model = process.env.GEMINI_MODEL || "gemini-3.8-flash";
  const parts = [
    ...images.map(i => ({ inline_data: { mime_type: i.mime || "image/jpeg", data: i.data } })),
    { text: prompt }
  ];
  try {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        contents: [{ role: "user", parts }],
        generationConfig: json ? { responseMimeType: "application/json", temperature: 0.1 } : { temperature: 0.4 }
      })
    });
    const d = await r.json();
    if (!r.ok) return res.status(r.status === 429 ? 429 : 502).json({ error: d?.error?.message || "Gemini 호출 실패" });
    const text = (d.candidates?.[0]?.content?.parts || []).map(p => p.text || "").join("");
    return res.status(200).json({ text });
  } catch (e) {
    return res.status(502).json({ error: "Gemini에 연결하지 못했어요." });
  }
}
