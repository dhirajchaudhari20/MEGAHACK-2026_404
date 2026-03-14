import type { ChatSession, ChatMetadata } from '../types';

const DB_NAME = 'KissanMitraDB';
const DB_VERSION = 1;
const STORE_NAME = 'chatSessions';

let db: IDBDatabase | null = null;

const initDB = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    if (db) {
      resolve(db);
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => {
      console.error('IndexedDB error:', request.error);
      reject('Error opening database');
    };

    request.onsuccess = () => {
      db = request.result;
      resolve(db);
    };

    request.onupgradeneeded = () => {
      const dbInstance = request.result;
      if (!dbInstance.objectStoreNames.contains(STORE_NAME)) {
        dbInstance.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
  });
};

export const databaseService = {
  addOrUpdateChat: async (chat: ChatSession): Promise<ChatSession> => {
    const db = await initDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.put(chat);

      request.onsuccess = () => resolve(chat);
      request.onerror = () => reject(request.error);
    });
  },

  getChat: async (id: string): Promise<ChatSession | null> => {
    const db = await initDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get(id);

      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  },
  
  // Gets only metadata to efficiently populate the chat list
  getAllChatMetadata: async (): Promise<ChatMetadata[]> => {
    const db = await initDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.getAll();

      request.onsuccess = () => {
        const chats: ChatSession[] = request.result;
        // Sort by most recent first
        chats.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
        const metadata: ChatMetadata[] = chats.map(({ id, title, timestamp }) => ({ id, title, timestamp }));
        resolve(metadata);
      };
      request.onerror = () => reject(request.error);
    });
  },
  
  deleteChat: async (id: string): Promise<void> => {
    const db = await initDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.delete(id);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  },
};
