// Firebase(로그인·데이터·파일)와 Gemini(글자 인식·분석)를 앱에 연결하는 다리 역할 파일.
// 앱 본문(index.html)은 window.claude.use(이름) 으로 기능을 요청하고, 여기서 Firebase/Gemini로 처리해요.
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, onAuthStateChanged, GoogleAuthProvider, signInWithPopup, signInWithRedirect, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { initializeFirestore, doc, collection, getDoc, getDocs, setDoc, updateDoc, deleteDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { getStorage, ref, uploadBytes, getDownloadURL, getBlob, deleteObject } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";
import { firebaseConfig, ADMIN_EMAILS } from "./firebase-config.js";

const configured = !String(firebaseConfig.apiKey || "").startsWith("여기에");
let app = null, auth = null, fs = null, st = null;
if (configured) {
  app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  fs = initializeFirestore(app, { ignoreUndefinedProperties: true });
  try { st = getStorage(app); } catch { st = null; }
}

let currentUser = null;
const authReady = new Promise(res => { if (!auth) return res(null); onAuthStateChanged(auth, u => { const first = currentUser === null && !authReady._done; currentUser = u; drawAuth(); if (first) { authReady._done = true; res(u); } else location.reload(); }); });
const isAdmin = () => !!currentUser && ADMIN_EMAILS.map(e => e.toLowerCase()).includes((currentUser.email || "").toLowerCase());

/* 로그인 버튼 */
function drawAuth() {
  const box = document.getElementById("authBox"); if (!box) return;
  if (!configured) { box.innerHTML = `<span class="store-chip">Firebase 설정 전 · 이 기기에만 저장</span>`; return; }
  if (currentUser) {
    box.innerHTML = `<span class="small muted" title="${currentUser.email}">${currentUser.displayName || currentUser.email}</span><button class="btn sm ghost" id="logoutBtn">로그아웃</button>`;
    document.getElementById("logoutBtn").onclick = () => signOut(auth);
  } else {
    box.innerHTML = `<button class="btn sm primary" id="loginBtn">Google로 로그인</button>`;
    document.getElementById("loginBtn").onclick = async () => {
      const p = new GoogleAuthProvider();
      try { await signInWithPopup(auth, p); } catch (e) { if (String(e?.code).includes("popup")) signInWithRedirect(auth, p); else alert("로그인하지 못했어요: " + (e?.message || e)); }
    };
  }
}
document.addEventListener("DOMContentLoaded", drawAuth);

/* db: 앱이 쓰던 문서/컬렉션 방식 그대로 Firestore에 연결 */
// Firestore는 배열 안의 배열을 저장하지 못해서, 저장할 때 감싸고 읽을 때 풀어요.
const enc = (v, inArr = false) => Array.isArray(v) ? (inArr ? { __a: v.map(x => enc(x, true)) } : v.map(x => enc(x, true))) : (v && typeof v === "object" ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, enc(x, false)])) : v);
const dec = v => Array.isArray(v) ? v.map(dec) : (v && typeof v === "object" ? (Array.isArray(v.__a) && Object.keys(v).length === 1 ? v.__a.map(dec) : Object.fromEntries(Object.entries(v).map(([k, x]) => [k, dec(x)]))) : v);
const wrapSnap = s => ({ id: s.id, exists: s.exists(), data: () => s.exists() ? dec(s.data()) : undefined, metadata: { fromCache: s.metadata.fromCache, hasPendingWrites: s.metadata.hasPendingWrites } });
const mkDoc = path => ({
  path, id: path.split("/").pop(),
  get: async () => wrapSnap(await getDoc(doc(fs, path))),
  set: data => setDoc(doc(fs, path), enc(data)),
  update: data => updateDoc(doc(fs, path), enc(data)),
  delete: () => deleteDoc(doc(fs, path)),
  onSnapshot: (next, err) => onSnapshot(doc(fs, path), s => next(wrapSnap(s)), e => err && err({ code: e.code, message: e.message })),
  collection: sub => mkCol(path + "/" + sub)
});
const mkCol = path => ({
  path,
  doc: id => mkDoc(path + "/" + (id || crypto.randomUUID().replace(/-/g, ""))),
  add: async data => { const d = mkDoc(path + "/" + crypto.randomUUID().replace(/-/g, "")); await d.set(data); return d; },
  get: async () => { const s = await getDocs(collection(fs, path)); return { docs: s.docs.map(d => ({ id: d.id, exists: true, data: () => dec(d.data()) })), size: s.size, empty: s.empty }; }
});
const DB = { doc: mkDoc, collection: mkCol };

/* user */
const USER = {
  id: async () => currentUser?.uid || null,
  isOwner: async () => isAdmin(),
  canEdit: async () => isAdmin(),
  can: async () => !!currentUser,
  me: async () => ({ id: currentUser?.uid || null, name: currentUser?.displayName || "" }),
  profiles: async ids => Object.fromEntries((ids || []).map(i => [i, { id: i, name: i === currentUser?.uid ? (currentUser.displayName || "") : "" }]))
};

/* assets: Firebase Storage (uploads/<내 uid>/<파일 id>) */
const ASSETS = {
  upload: async blob => {
    if (!st || !currentUser) throw new Error("storage_unavailable");
    const id = crypto.randomUUID().replace(/-/g, "");
    const path = `uploads/${currentUser.uid}/${id}`;
    const r = ref(st, path);
    await uploadBytes(r, blob, { contentType: blob.type || "application/octet-stream" });
    const url = await getDownloadURL(r);
    return { id: path, url, sizeBytes: blob.size, contentType: blob.type };
  },
  getBlob: async path => getBlob(ref(st, path)),
  delete: async path => deleteObject(ref(st, path))
};

/* sample: Gemini (Vercel의 /api/gemini 를 거쳐 호출, API 키는 서버에만 있음) */
const blobToB64 = b => new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res({ mime: b.type || "image/jpeg", data: String(fr.result).split(",")[1] }); fr.onerror = rej; fr.readAsDataURL(b); });
async function gemini(input, opts = {}, json = false) {
  if (!currentUser) throw { code: "not_granted", message: "로그인이 필요해요" };
  const prompt = typeof input === "string" ? input : (input.at(-1)?.content || "");
  let imgs = opts.images ? (opts.images instanceof Blob ? [opts.images] : [...opts.images]) : [];
  const images = await Promise.all(imgs.map(blobToB64));
  const token = await currentUser.getIdToken();
  const r = await fetch("/api/gemini", { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + token }, body: JSON.stringify({ prompt, images, json }), signal: opts.signal });
  if (r.status === 429) throw { code: "rate_limited" };
  if (r.status === 413) throw { code: "image_rejected" };
  if (!r.ok) { let m = ""; try { m = (await r.json()).error; } catch {} throw { code: "error", message: m || ("HTTP " + r.status) }; }
  const { text } = await r.json();
  opts.onText?.({ text, delta: text });
  return text || "";
}
const SAMPLE = async (input, opts) => ({ text: await gemini(input, opts, false), truncated: false });
SAMPLE.json = async (input, opts) => { const t = await gemini(input, opts, true); const clean = t.trim().replace(/^```(?:json)?\s*/i, "").replace(/```$/, ""); return JSON.parse(clean); };
SAMPLE.limits = async () => ({ maxPromptBytes: 262144, images: { maxCount: 4, maxInputBytes: 20e6, mediaTypes: ["image/jpeg", "image/png", "image/webp"] } });

/* downloads */
const DOWNLOADS = { save: async ({ filename, data }) => { const u = URL.createObjectURL(data instanceof Blob ? data : new Blob([data])); const a = document.createElement("a"); a.href = u; a.download = filename; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(u), 4000); } };

window.claude = {
  async use(name) {
    if (name === "downloads") return DOWNLOADS;
    if (!configured) return null;
    await authReady;
    if (!currentUser) return null;
    return { db: DB, user: USER, assets: st ? ASSETS : null, sample: SAMPLE }[name] ?? null;
  }
};
