import { initializeApp, type FirebaseApp } from 'firebase/app';
import { getFirestore, type Firestore } from 'firebase/firestore';
import { getStorage, type FirebaseStorage } from 'firebase/storage';
import { getAuth, signInAnonymously, onAuthStateChanged, type Auth } from 'firebase/auth';

/** share-drop과 같은 Firebase 프로젝트를 재사용합니다.
 * sssOK 데이터는 `sssok_rooms` 컬렉션과 `sssok/` Storage 경로 아래에만 있어
 * share-drop 데이터와 섞이지 않습니다.
 *
 * 값이 하나라도 비어 있으면(로컬 개발 등) Firebase를 켜지 않고
 * 브라우저 저장(localStorage + IndexedDB) 모드로 조용히 폴백합니다. */

const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
};

export const firebaseEnabled = Boolean(
  config.apiKey && config.projectId && config.storageBucket && config.appId,
);

let app: FirebaseApp | null = null;
let dbInstance: Firestore | null = null;
let storageInstance: FirebaseStorage | null = null;
let authInstance: Auth | null = null;

if (firebaseEnabled) {
  app = initializeApp(config);
  dbInstance = getFirestore(app);
  storageInstance = getStorage(app);
  authInstance = getAuth(app);
}

export const db = dbInstance as Firestore;
export const storage = storageInstance as FirebaseStorage;
export const auth = authInstance as Auth;

let anonymousUser: Promise<string | null> | null = null;

/** 익명 인증으로 브라우저별 고유 uid를 받습니다.
 * 콘솔에서 익명 로그인이 꺼져 있으면 null을 반환하고, 호출부는 로컬 기기 ID로 폴백합니다. */
export function ensureAnonymousUser(): Promise<string | null> {
  if (!firebaseEnabled) return Promise.resolve(null);
  if (!anonymousUser) {
    anonymousUser = new Promise((resolve) => {
      const unsubscribe = onAuthStateChanged(auth, (user) => {
        unsubscribe();
        if (user) {
          resolve(user.uid);
          return;
        }
        signInAnonymously(auth)
          .then((cred) => resolve(cred.user.uid))
          .catch((error: unknown) => {
            console.warn('익명 인증을 사용할 수 없어 로컬 기기 ID로 폴백합니다:', error);
            resolve(null);
          });
      });
    });
  }
  return anonymousUser;
}
