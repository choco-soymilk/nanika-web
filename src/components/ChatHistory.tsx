import React, { useEffect, useRef } from 'react';
import type { DialogueLine } from '../types';
import { Trash2, Languages, Loader2 } from 'lucide-react';
import { translations } from '../data/translations';
import { getEffectiveUserName } from '../services/storage';

interface HistoryProps {
  history: DialogueLine[];
  onClear: () => void;
  userName?: string;
  language?: 'ko' | 'en';
  emptyMessage?: string;
  isUkagakaActive?: boolean;
  onTranslateLine?: (index: number) => void;
  translatingIndex?: number;
  translationDisplayMode?: 'both' | 'translationOnly';
}

const hasJapanese = (str: string) => /[\u3000-\u303f\u3040-\u309f\u30a0-\u30ff\uff00-\uffef\u4e00-\u9faf]/.test(str);

export const ChatHistory: React.FC<HistoryProps> = ({
  history,
  onClear,
  userName = '주인',
  language = 'ko',
  emptyMessage,
  isUkagakaActive = false,
  onTranslateLine,
  translatingIndex,
  translationDisplayMode = 'both',
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const t = translations[language];

  // Auto-scroll to bottom when new history items arrive
  useEffect(() => {
    if (containerRef.current) {
      const scrollParent = containerRef.current.closest('.phone-content');
      if (scrollParent) {
        scrollParent.scrollTop = scrollParent.scrollHeight;
      }
    }
  }, [history]);

  if (history.length === 0) {
    return (
      <div className="history-empty">
        {emptyMessage || t.emptyHistory}
      </div>
    );
  }

  return (
    <div className="chat-history-container">
      <div className="chat-history-header">
        <span className="chat-history-title">{t.chatHistory} ({history.length})</span>
        <button className="btn-clear-history" onClick={onClear} title={t.clearHistoryTitle}>
          <Trash2 size={14} style={{ marginRight: '4px' }} />
          {t.clear}
        </button>
      </div>

      <div className="chat-history-list" ref={containerRef}>
        {history.map((line, index) => {
          const isStrawberry = line.character === 'strawberry';
          const isUser = line.character === 'user';
          
          let speakerTag = `👤 ${getEffectiveUserName(userName, language)}`;
          let bubbleClass = 'bubble-user';
          if (isStrawberry) {
            const prefix = isUkagakaActive ? '🌸' : '🍓';
            speakerTag = `${prefix} ${line.speakerName || t.charStrawberry}`;
            bubbleClass = 'bubble-strawberry';
          } else if (line.character === 'choco') {
            const prefix = isUkagakaActive ? '🍀' : '🍫';
            speakerTag = `${prefix} ${line.speakerName || t.charChoco}`;
            bubbleClass = 'bubble-choco';
          }

          return (
            <div key={line.timestamp || index} className={`chat-history-row ${isUser ? 'row-user' : 'row-mascot'}`}>
              <div className="chat-history-label">{speakerTag}</div>
              <div className={`chat-history-bubble ${bubbleClass}`}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '8px' }}>
                  {translationDisplayMode === 'translationOnly' && line.translatedText ? (
                    <span style={{ whiteSpace: 'pre-wrap', flex: 1 }}>{line.translatedText}</span>
                  ) : (
                    <>
                      <span style={{ whiteSpace: 'pre-wrap', flex: 1 }}>{line.text}</span>
                      {!isUser && hasJapanese(line.text) && !line.translatedText && onTranslateLine && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onTranslateLine(index);
                          }}
                          disabled={translatingIndex === index}
                          style={{
                            background: 'none',
                            border: 'none',
                            color: 'rgba(255, 255, 255, 0.4)',
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            padding: '2px',
                            marginTop: '2px',
                            transition: 'color 0.2s',
                            alignSelf: 'flex-start'
                          }}
                          onMouseOver={(e) => e.currentTarget.style.color = '#fff'}
                          onMouseOut={(e) => e.currentTarget.style.color = 'rgba(255, 255, 255, 0.4)'}
                          title="Translate"
                        >
                          {translatingIndex === index ? (
                            <Loader2 size={12} className="animate-spin" />
                          ) : (
                            <Languages size={12} />
                          )}
                        </button>
                      )}
                    </>
                  )}
                </div>
                {translationDisplayMode === 'both' && line.translatedText && (
                  <div style={{
                    marginTop: '6px',
                    paddingTop: '6px',
                    borderTop: '1px dashed rgba(255, 255, 255, 0.15)',
                    fontSize: '0.85em',
                    opacity: 0.85,
                    fontStyle: 'italic',
                    whiteSpace: 'pre-wrap'
                  }}>
                    {line.translatedText}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
