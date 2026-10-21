// ① Firebase 콘솔 → 프로젝트 설정 → 내 앱(웹) → "SDK 설정 및 구성"의 값을 그대로 붙여 넣으세요.
export const firebaseConfig = {
  apiKey: "여기에_apiKey",
  authDomain: "여기에_프로젝트ID.firebaseapp.com",
  projectId: "여기에_프로젝트ID",
  storageBucket: "여기에_프로젝트ID.firebasestorage.app",
  messagingSenderId: "여기에_messagingSenderId",
  appId: "여기에_appId"
};

// ② 관리자(선생님) Google 계정 이메일. 여러 명이면 쉼표로 추가하세요.
//    firestore.rules, storage.rules 의 이메일 목록도 똑같이 맞춰야 해요.
export const ADMIN_EMAILS = ["pol082753@gmail.com"];
