import React, { useState } from 'react';
import type { AppSettings } from '../types';
import { X, Eye, EyeOff, Key, ShieldAlert, Sparkles, Timer, User, MessageSquare } from 'lucide-react';

interface SettingsProps {
  settings: AppSettings;
  isOpen: boolean;
  onClose: () => void;
  onSave: (apiKey: string, banterInterval: number, userName: string, maxHistoryLimit: number) => void;
}

export const SettingsModal: React.FC<SettingsProps> = ({
  settings,
  isOpen,
  onClose,
  onSave,
}) => {
  const [apiKey, setApiKey] = useState(settings.apiKey);
  const [banterInterval, setBanterInterval] = useState(settings.banterInterval);
  const [userName, setUserName] = useState(settings.userName || '주인');
  const [maxHistoryLimit, setMaxHistoryLimit] = useState(settings.maxHistoryLimit || 200);
  const [showKey, setShowKey] = useState(false);

  if (!isOpen) return null;

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(apiKey.trim(), banterInterval, userName.trim() || '주인', maxHistoryLimit);
    onClose();
  };

  const intervals = [
    { label: '끔', value: 0 },
    { label: '1분', value: 60 },
    { label: '2분', value: 120 },
    { label: '3분', value: 180 },
    { label: '5분', value: 300 },
    { label: '10분', value: 600 },
  ];

  return (
    <div className="modal-overlay">
      <div className="modal-card">
        <div className="modal-header">
          <div className="modal-title">
            <Sparkles size={18} className="icon-gold" style={{ marginRight: '6px' }} />
            설정 및 API 연동
          </div>
          <button className="modal-close-btn" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSave} className="modal-form">
          <div className="form-section">
            <label className="form-label">
              <Key size={14} className="icon-purple" style={{ marginRight: '4px' }} />
              Google AI Studio (Gemini) API Key
            </label>
            <div className="input-with-icon">
              <input
                type={showKey ? 'text' : 'password'}
                className="input-text"
                placeholder="AIzaSy... API 키를 입력하세요"
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
            <div className="form-hint">
              <ShieldAlert size={12} style={{ marginRight: '4px', flexShrink: 0, marginTop: '2px' }} />
              <span>
                입력하신 API Key는 외부 서버로 절대 전송되지 않으며, 브라우저의 <strong>localStorage</strong>에만 안전하게 저장됩니다.
              </span>
            </div>
          </div>

          <div className="form-section">
            <label className="form-label">
              <User size={14} className="icon-purple" style={{ marginRight: '4px' }} />
              사용자 이름 (호칭)
            </label>
            <input
              type="text"
              className="input-text"
              placeholder="주인"
              value={userName}
              onChange={(e) => setUserName(e.target.value)}
              maxLength={15}
            />
            <div className="form-hint">
              캐릭터들이 대화 속에서 사용자를 부를 때 사용하는 호칭입니다. (기본값: 주인)
            </div>
          </div>

          <div className="form-section">
            <label className="form-label">
              <Timer size={14} className="icon-purple" style={{ marginRight: '4px' }} />
              화면 자동 만담 주기
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
              앱 화면이 켜져 있는 동안 해당 주기마다 캐릭터들이 서로 대화를 나눕니다.
            </div>
          </div>

          <div className="form-section">
            <label className="form-label">
              <MessageSquare size={14} className="icon-purple" style={{ marginRight: '4px' }} />
              최대 대화 기록 저장 개수
            </label>
            <div className="interval-grid">
              {[100, 200, 300].map((limit) => (
                <button
                  type="button"
                  key={limit}
                  className={`interval-chip ${maxHistoryLimit === limit ? 'active' : ''}`}
                  onClick={() => setMaxHistoryLimit(limit)}
                >
                  {limit}개
                </button>
              ))}
            </div>
            <div className="form-hint">
              대화 내역이 너무 많이 쌓이는 것을 방지하기 위해 지정된 개수만큼만 오래된 순으로 남기고 자동 삭제합니다.
            </div>
          </div>

          <div className="modal-actions">
            <button type="button" className="btn-secondary flex-1" onClick={onClose}>
              취소
            </button>
            <button type="submit" className="btn-primary flex-1">
              설정 저장
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
