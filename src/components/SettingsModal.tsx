import React, { useState, useEffect } from 'react';
import type { AppSettings } from '../types';
import { X, Eye, EyeOff, Key, ShieldAlert, Sparkles, Timer, User, MessageSquare, Languages } from 'lucide-react';
import { translations } from '../data/translations';
import { getEffectiveUserName } from '../services/storage';

interface SettingsProps {
  settings: AppSettings;
  isOpen: boolean;
  onClose: () => void;
  onSave: (apiKey: string, banterInterval: number, userName: string, maxHistoryLimit: number, language: 'ko' | 'en') => void;
}

export const SettingsModal: React.FC<SettingsProps> = ({
  settings,
  isOpen,
  onClose,
  onSave,
}) => {
  const [apiKey, setApiKey] = useState(settings.apiKey);
  const [banterInterval, setBanterInterval] = useState(settings.banterInterval);
  const [userName, setUserName] = useState(settings.userName);
  const [maxHistoryLimit, setMaxHistoryLimit] = useState(settings.maxHistoryLimit || 200);
  const [language, setLanguage] = useState<'ko' | 'en'>(settings.language || 'ko');
  const [showKey, setShowKey] = useState(false);

  // Sync state with settings when it changes or when modal is opened
  useEffect(() => {
    if (isOpen) {
      setApiKey(settings.apiKey);
      setBanterInterval(settings.banterInterval);
      setUserName(getEffectiveUserName(settings.userName, settings.language));
      setMaxHistoryLimit(settings.maxHistoryLimit);
      setLanguage(settings.language);
    }
  }, [isOpen, settings]);

  const handleLanguageChange = (lang: 'ko' | 'en') => {
    setLanguage(lang);
    const trimmed = userName.trim();
    if (!trimmed || trimmed === '주인' || trimmed === '주인님' || trimmed === 'Master' || trimmed === 'master') {
      setUserName(lang === 'ko' ? '주인' : 'Master');
    }
  };

  if (!isOpen) return null;

  const t = translations[language];

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    const defaultName = language === 'ko' ? '주인' : 'Master';
    onSave(apiKey.trim(), banterInterval, userName.trim() || defaultName, maxHistoryLimit, language);
    onClose();
  };

  const intervals = [
    { label: t.intervals.off, value: 0 },
    { label: t.intervals.min1, value: 60 },
    { label: t.intervals.min2, value: 120 },
    { label: t.intervals.min3, value: 180 },
    { label: t.intervals.min5, value: 300 },
    { label: t.intervals.min10, value: 600 },
  ];

  return (
    <div className="modal-overlay">
      <div className="modal-card">
        <div className="modal-header">
          <div className="modal-title">
            <Sparkles size={18} className="icon-gold" style={{ marginRight: '6px' }} />
            {t.settingsTitle}
          </div>
          <button className="modal-close-btn" onClick={onClose} aria-label={t.close}>
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSave} className="modal-form">
          {/* Language Selection */}
          <div className="form-section">
            <label className="form-label">
              <Languages size={14} className="icon-purple" style={{ marginRight: '4px' }} />
              {t.languageLabel}
            </label>
            <div className="interval-grid">
              {(['ko', 'en'] as const).map((lang) => (
                <button
                  type="button"
                  key={lang}
                  className={`interval-chip ${language === lang ? 'active' : ''}`}
                  onClick={() => handleLanguageChange(lang)}
                >
                  {lang === 'ko' ? '한국어' : 'English'}
                </button>
              ))}
            </div>
            <div className="form-hint">
              {t.languageHint}
            </div>
          </div>

          <div className="form-section">
            <label className="form-label">
              <Key size={14} className="icon-purple" style={{ marginRight: '4px' }} />
              {t.apiKeyLabel}
            </label>
            <div className="input-with-icon">
              <input
                type={showKey ? 'text' : 'password'}
                className="input-text"
                placeholder={t.apiKeyPlaceholder}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                autoComplete="off"
              />
              <button
                type="button"
                className="btn-toggle-visibility"
                onClick={() => setShowKey(!showKey)}
              >
                {showKey ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            <div className="form-hint" style={{ display: 'flex', alignItems: 'flex-start' }}>
              <ShieldAlert size={12} style={{ marginRight: '4px', flexShrink: 0, marginTop: '2px' }} />
              <span>
                {t.apiKeyHint}
              </span>
            </div>
          </div>

          <div className="form-section">
            <label className="form-label">
              <User size={14} className="icon-purple" style={{ marginRight: '4px' }} />
              {t.userNameLabel}
            </label>
            <input
              type="text"
              className="input-text"
              placeholder={t.userNamePlaceholder}
              value={userName}
              onChange={(e) => setUserName(e.target.value)}
              maxLength={15}
            />
            <div className="form-hint">
              {t.userNameHint}
            </div>
          </div>

          <div className="form-section">
            <label className="form-label">
              <Timer size={14} className="icon-purple" style={{ marginRight: '4px' }} />
              {t.banterIntervalLabel}
            </label>
            <div className="interval-grid">
              {intervals.map((item) => (
                <button
                  type="button"
                  key={item.value}
                  className={`interval-chip ${banterInterval === item.value ? 'active' : ''} ${item.value === 0 ? 'chip-off' : ''}`}
                  onClick={() => setBanterInterval(item.value)}
                >
                  {item.label}
                </button>
              ))}
            </div>
            <div className="form-hint">
              {t.banterIntervalHint}
            </div>
          </div>

          <div className="form-section">
            <label className="form-label">
              <MessageSquare size={14} className="icon-purple" style={{ marginRight: '4px' }} />
              {t.maxHistoryLimitLabel}
            </label>
            <div className="interval-grid">
              {[100, 200, 300].map((limit) => (
                <button
                  type="button"
                  key={limit}
                  className={`interval-chip ${maxHistoryLimit === limit ? 'active' : ''}`}
                  onClick={() => setMaxHistoryLimit(limit)}
                >
                  {limit}{t.historyLimitUnit}
                </button>
              ))}
            </div>
            <div className="form-hint">
              {t.maxHistoryLimitHint}
            </div>
          </div>

          <div className="modal-actions">
            <button type="button" className="btn-secondary flex-1" onClick={onClose}>
              {t.cancel}
            </button>
            <button type="submit" className="btn-primary flex-1">
              {t.saveSettings}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
