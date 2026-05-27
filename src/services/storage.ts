import type { DialogueLine } from '../types';

const KEYS = {
  GEMINI_API_KEY: 'nanika_web_gemini_api_key',
  BANTER_INTERVAL: 'nanika_web_banter_interval',
  CHAT_HISTORY: 'nanika_web_chat_history',
  USER_NAME: 'nanika_web_user_name',
  MAX_HISTORY_LIMIT: 'nanika_web_max_history_limit',
  LANGUAGE: 'nanika_web_language',
};

export const StorageService = {
  getApiKey(): string {
    return localStorage.getItem(KEYS.GEMINI_API_KEY) || '';
  },

  setApiKey(key: string): void {
    localStorage.setItem(KEYS.GEMINI_API_KEY, key.trim());
  },

  clearApiKey(): void {
    localStorage.removeItem(KEYS.GEMINI_API_KEY);
  },

  getBanterInterval(): number {
    const val = localStorage.getItem(KEYS.BANTER_INTERVAL);
    // Default to 120 seconds if not set
    return val ? parseInt(val, 10) : 120;
  },

  setBanterInterval(seconds: number): void {
    localStorage.setItem(KEYS.BANTER_INTERVAL, seconds.toString());
  },

  getUserName(): string {
    const val = localStorage.getItem(KEYS.USER_NAME);
    if (!val || val.trim() === '주인님') {
      return '주인';
    }
    return val.trim();
  },

  setUserName(name: string): void {
    const trimmed = name.trim();
    localStorage.setItem(KEYS.USER_NAME, trimmed === '주인님' || !trimmed ? '주인' : trimmed);
  },

  getMaxHistoryLimit(): number {
    const val = localStorage.getItem(KEYS.MAX_HISTORY_LIMIT);
    // Default to 200 if not set
    return val ? parseInt(val, 10) : 200;
  },

  setMaxHistoryLimit(limit: number): void {
    localStorage.setItem(KEYS.MAX_HISTORY_LIMIT, limit.toString());
  },

  getChatHistory(): DialogueLine[] {
    const val = localStorage.getItem(KEYS.CHAT_HISTORY);
    if (!val) return [];
    try {
      return JSON.parse(val);
    } catch (e) {
      console.error('Error parsing chat history:', e);
      return [];
    }
  },

  setChatHistory(history: DialogueLine[]): void {
    const limit = this.getMaxHistoryLimit();
    const trimmed = history.slice(-limit);
    localStorage.setItem(KEYS.CHAT_HISTORY, JSON.stringify(trimmed));
  },

  clearChatHistory(): void {
    localStorage.removeItem(KEYS.CHAT_HISTORY);
  },

  getLanguage(): 'ko' | 'en' {
    const val = localStorage.getItem(KEYS.LANGUAGE);
    if (val === 'ko' || val === 'en') {
      return val;
    }
    return navigator.language.startsWith('ko') ? 'ko' : 'en';
  },

  setLanguage(lang: 'ko' | 'en'): void {
    localStorage.setItem(KEYS.LANGUAGE, lang);
  },
};

export function getEffectiveUserName(userName: string, language: 'ko' | 'en'): string {
  const trimmed = userName.trim();
  if (!trimmed || trimmed === '주인' || trimmed === '주인님' || trimmed === 'Master' || trimmed === 'master') {
    return language === 'ko' ? '주인' : 'Master';
  }
  return trimmed;
}
