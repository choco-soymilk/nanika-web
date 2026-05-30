import React, { useState, useEffect } from 'react';
import type { AppSettings } from '../types';
import { X, Eye, EyeOff, Key, ShieldAlert, Sparkles, Timer, User, MessageSquare, Languages, Upload, Trash2 } from 'lucide-react';
import { translations } from '../data/translations';
import { getEffectiveUserName, StorageService } from '../services/storage';

interface SettingsProps {
  settings: AppSettings;
  isOpen: boolean;
  onClose: () => void;
  onSave: (
    apiKey: string,
    banterInterval: number,
    userName: string,
    maxHistoryLimit: number,
    language: 'ko' | 'en',
    autoTranslate: boolean,
    translationDisplayMode: 'both' | 'translationOnly'
  ) => void;
  onImportNar?: (file: File) => void;
  activeUkagakaName?: string;
  onResetUkagaka?: () => void;
}

export const SettingsModal: React.FC<SettingsProps> = ({
  settings,
  isOpen,
  onClose,
  onSave,
  onImportNar,
  activeUkagakaName,
  onResetUkagaka,
}) => {
  const [apiKey, setApiKey] = useState(settings.apiKey);
  const [banterInterval, setBanterInterval] = useState(settings.banterInterval);
  const [userName, setUserName] = useState(settings.userName);
  const [maxHistoryLimit, setMaxHistoryLimit] = useState(settings.maxHistoryLimit || 200);
  const [language, setLanguage] = useState<'ko' | 'en'>(settings.language || 'ko');
  const [autoTranslate, setAutoTranslate] = useState<boolean>(settings.autoTranslate);
  const [translationDisplayMode, setTranslationDisplayMode] = useState<'both' | 'translationOnly'>(settings.translationDisplayMode);
  const [showKey, setShowKey] = useState(false);

  // Translation/Personality States
  const [ghostPersonality, setGhostPersonality] = useState('');
  const [ghostDescription, setGhostDescription] = useState('');
  const [cacheClearMessage, setCacheClearMessage] = useState<string | null>(null);
  const [translationWarning, setTranslationWarning] = useState<string | null>(null);

  // Sync state with settings when it changes or when modal is opened
  useEffect(() => {
    if (isOpen) {
      setApiKey(settings.apiKey);
      setBanterInterval(settings.banterInterval);
      setUserName(getEffectiveUserName(settings.userName, settings.language));
      setMaxHistoryLimit(settings.maxHistoryLimit);
      setLanguage(settings.language);
      setAutoTranslate(settings.autoTranslate);
      setTranslationDisplayMode(settings.translationDisplayMode);
      setTranslationWarning(null);

      if (activeUkagakaName) {
        const config = StorageService.getGhostConfig(activeUkagakaName);
        setGhostPersonality(config.personality);
        setGhostDescription(config.description);
      } else {
        setGhostPersonality('');
        setGhostDescription('');
      }
      setCacheClearMessage(null);
    }
  }, [isOpen, settings, activeUkagakaName]);

  // Clear translation warning when api key is typed
  useEffect(() => {
    if (apiKey.trim()) {
      setTranslationWarning(null);
    }
  }, [apiKey]);

  const handleLanguageChange = (lang: 'ko' | 'en') => {
    setLanguage(lang);
    const trimmed = userName.trim();
    if (!trimmed || trimmed === '주인' || trimmed === '주인님' || trimmed === 'Master' || trimmed === 'master') {
      setUserName(lang === 'ko' ? '주인' : 'Master');
    }
  };

  if (!isOpen) return null;

  const t = translations[language];

  const handleToggleAutoTranslate = (enabled: boolean) => {
    if (enabled && !apiKey.trim()) {
      setTranslationWarning(t.apiKeyRequiredForTranslation);
      setAutoTranslate(false);
      return;
    }
    setTranslationWarning(null);
    setAutoTranslate(enabled);
  };

  const handleChangeDisplayMode = (mode: 'both' | 'translationOnly') => {
    if (!apiKey.trim()) {
      setTranslationWarning(t.apiKeyRequiredForTranslation);
      return;
    }
    setTranslationWarning(null);
    setTranslationDisplayMode(mode);
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    const defaultName = language === 'ko' ? '주인' : 'Master';
    onSave(apiKey.trim(), banterInterval, userName.trim() || defaultName, maxHistoryLimit, language, autoTranslate, translationDisplayMode);

    if (activeUkagakaName) {
      StorageService.setGhostConfig(activeUkagakaName, {
        personality: ghostPersonality.trim(),
        description: ghostDescription.trim(),
      });
    }
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

          {/* Ukagaka NAR Import Section */}
          <div className="form-section" style={{ borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: '16px', marginTop: '16px' }}>
            <label className="form-label">
              <Upload size={14} className="icon-purple" style={{ marginRight: '4px' }} />
              {t.importNarLabel}
            </label>
            
            {activeUkagakaName ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div className="active-ukagaka-banner" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', backgroundColor: 'rgba(139, 92, 246, 0.1)', padding: '10px 12px', borderRadius: '8px', border: '1px solid rgba(139, 92, 246, 0.2)', marginBottom: '4px', gap: '8px' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0 }}>
                    <span style={{ fontSize: '10px', opacity: 0.6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{t.activeUkagakaLabel}</span>
                    <span style={{ fontWeight: 'bold', fontSize: '13px', color: '#a78bfa', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{activeUkagakaName}</span>
                  </div>
                  <button
                    type="button"
                    onClick={onResetUkagaka}
                    className="btn-unload"
                    style={{ display: 'flex', alignItems: 'center', backgroundColor: 'rgba(239, 68, 68, 0.15)', color: '#f87171', border: '1px solid rgba(239, 68, 68, 0.25)', borderRadius: '6px', padding: '6px 10px', fontSize: '11px', cursor: 'pointer', gap: '4px', whiteSpace: 'nowrap', transition: 'all 0.2s' }}
                    onMouseOver={(e) => e.currentTarget.style.backgroundColor = 'rgba(239, 68, 68, 0.25)'}
                    onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'rgba(239, 68, 68, 0.15)'}
                  >
                    <Trash2 size={12} />
                    {t.unloadUkagaka}
                  </button>
                </div>

                <div className="form-sub-section" style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label className="form-label" style={{ fontSize: '11px', opacity: 0.9, marginBottom: 0 }}>
                    {t.ghostPersonalityLabel}
                  </label>
                  <input
                    type="text"
                    className="input-text"
                    style={{ fontSize: '12px', padding: '8px 10px' }}
                    placeholder={t.ghostPersonalityPlaceholder}
                    value={ghostPersonality}
                    onChange={(e) => setGhostPersonality(e.target.value)}
                  />
                  <div className="form-hint" style={{ fontSize: '10px', marginTop: '0px' }}>
                    {t.ghostPersonalityHint}
                  </div>
                </div>

                <div className="form-sub-section" style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label className="form-label" style={{ fontSize: '11px', opacity: 0.9, marginBottom: 0 }}>
                    {t.ghostDescriptionLabel}
                  </label>
                  <textarea
                    className="input-text"
                    style={{ fontSize: '12px', padding: '8px 10px', minHeight: '60px', resize: 'vertical', fontFamily: 'inherit' }}
                    placeholder={t.ghostDescriptionPlaceholder}
                    value={ghostDescription}
                    onChange={(e) => setGhostDescription(e.target.value)}
                  />
                  <div className="form-hint" style={{ fontSize: '10px', marginTop: '0px' }}>
                    {t.ghostDescriptionHint}
                  </div>
                </div>
              </div>
            ) : (
              <div className="file-upload-container" style={{ position: 'relative', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <input
                  type="file"
                  accept=".nar,.zip"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file && onImportNar) {
                      onImportNar(file);
                    }
                  }}
                  style={{ display: 'none' }}
                  id="nar-file-input"
                />
                <label
                  htmlFor="nar-file-input"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    border: '2px dashed rgba(139, 92, 246, 0.25)',
                    borderRadius: '8px',
                    padding: '14px',
                    cursor: 'pointer',
                    backgroundColor: 'rgba(255, 255, 255, 0.02)',
                    transition: 'all 0.2s',
                    textAlign: 'center',
                    fontSize: '12px'
                  }}
                  onMouseOver={(e) => e.currentTarget.style.borderColor = 'rgba(139, 92, 246, 0.5)'}
                  onMouseOut={(e) => e.currentTarget.style.borderColor = 'rgba(139, 92, 246, 0.25)'}
                >
                  <Upload size={14} />
                  <span>{t.importNarLabel}</span>
                </label>
                
 


                <div className="form-hint">
                  {t.importNarHint}
                </div>
              </div>
            )}
          </div>

          {/* Translation Warning Box */}
          {translationWarning && (
            <div className="status-banner error" style={{ margin: '16px 0 0 0', borderRadius: '8px' }}>
              <span style={{ display: 'flex', alignItems: 'flex-start', fontSize: '11px', lineHeight: '1.4', textAlign: 'left' }}>
                <ShieldAlert size={14} style={{ marginRight: '6px', marginTop: '2px', flexShrink: 0 }} />
                {translationWarning}
              </span>
            </div>
          )}

          {/* Auto Translation Toggle Section */}
          <div className="form-section" style={{ borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: '16px', marginTop: '16px' }}>
            <label className="form-label">
              <Languages size={14} className="icon-purple" style={{ marginRight: '4px' }} />
              {t.autoTranslateLabel}
            </label>
            <div className="interval-grid">
              <button
                type="button"
                className={`interval-chip ${autoTranslate ? 'active' : ''}`}
                onClick={() => handleToggleAutoTranslate(true)}
              >
                {language === 'ko' ? '켬' : 'On'}
              </button>
              <button
                type="button"
                className={`interval-chip ${!autoTranslate ? 'active' : ''}`}
                onClick={() => handleToggleAutoTranslate(false)}
              >
                {language === 'ko' ? '끔' : 'Off'}
              </button>
            </div>
            <div className="form-hint">
              {t.autoTranslateHint}
            </div>
          </div>

          {/* Translation Display Mode Section */}
          <div className="form-section" style={{ borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: '16px', marginTop: '16px' }}>
            <label className="form-label">
              <Languages size={14} className="icon-purple" style={{ marginRight: '4px' }} />
              {t.translationDisplayModeLabel}
            </label>
            <div className="interval-grid">
              <button
                type="button"
                className={`interval-chip ${translationDisplayMode === 'both' ? 'active' : ''}`}
                onClick={() => handleChangeDisplayMode('both')}
              >
                {t.displayModeBoth}
              </button>
              <button
                type="button"
                className={`interval-chip ${translationDisplayMode === 'translationOnly' ? 'active' : ''}`}
                onClick={() => handleChangeDisplayMode('translationOnly')}
              >
                {t.displayModeTranslationOnly}
              </button>
            </div>
            <div className="form-hint">
              {t.translationDisplayModeHint}
            </div>
          </div>

          {/* Translation Cache Section */}
          <div className="form-section" style={{ borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: '16px', marginTop: '16px' }}>
            <label className="form-label">
              <Languages size={14} className="icon-purple" style={{ marginRight: '4px' }} />
              {t.clearTranslationCacheLabel}
            </label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <button
                type="button"
                className="btn-unload"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: 'rgba(139, 92, 246, 0.1)',
                  color: '#c084fc',
                  border: '1px solid rgba(139, 92, 246, 0.25)',
                  borderRadius: '6px',
                  padding: '8px 12px',
                  fontSize: '12px',
                  cursor: 'pointer',
                  gap: '6px',
                  transition: 'all 0.2s',
                  width: '100%'
                }}
                onClick={() => {
                  StorageService.clearTranslationCache();
                  setCacheClearMessage(t.translationCacheCleared);
                  setTimeout(() => setCacheClearMessage(null), 3000);
                }}
                onMouseOver={(e) => e.currentTarget.style.backgroundColor = 'rgba(139, 92, 246, 0.2)'}
                onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'rgba(139, 92, 246, 0.1)'}
              >
                <Trash2 size={12} />
                {t.clearTranslationCacheLabel}
              </button>
              {cacheClearMessage && (
                <div style={{ fontSize: '11px', color: '#10b981', textAlign: 'center', fontWeight: '500' }}>
                  {cacheClearMessage}
                </div>
              )}
              <div className="form-hint">
                {t.clearTranslationCacheHint}
              </div>
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
