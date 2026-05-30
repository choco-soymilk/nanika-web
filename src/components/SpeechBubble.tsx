import React from 'react';
import type { Emotion } from '../types';
import { Languages, Loader2 } from 'lucide-react';

interface BubbleProps {
  text: string;
  emotion: Emotion;
  isActive: boolean;
  side: 'left' | 'right';
  children?: React.ReactNode;
  onTranslate?: () => void;
  translatedText?: string;
  isTranslating?: boolean;
  translationDisplayMode?: 'both' | 'translationOnly';
}

const EMOTION_COLORS: Record<Emotion, string> = {
  excited:       '#FF6B8A',
  happy:         '#FF9F43',
  encouraging:   '#FECA57',
  surprised:     '#A29BFE',
  worried:       '#FD79A8',
  angry:         '#D63031',
  sad:           '#74B9FF',
  philosophical: '#81ECEC',
  sleepy:        '#B2BEC3',
  calm:          '#55EFC4',
  cool:          '#6C5CE7',
  cynical:       '#636E72',
  smug:          '#FDCB6E',
  flustered:     '#E84393',
};

const hasJapanese = (str: string) => /[\u3000-\u303f\u3040-\u309f\u30a0-\u30ff\uff00-\uffef\u4e00-\u9faf]/.test(str);

export const SpeechBubble: React.FC<BubbleProps> = ({
  text,
  emotion,
  isActive,
  side,
  children,
  onTranslate,
  translatedText,
  isTranslating,
  translationDisplayMode = 'both',
}) => {
  if (!text && !children) return null;

  const accentColor = EMOTION_COLORS[emotion] || '#FFFFFF';

  return (
    <div
      className={`speech-bubble speech-bubble-${side} ${isActive ? 'active' : ''}`}
      style={{
        borderColor: accentColor,
        boxShadow: isActive ? `0 0 12px ${accentColor}66` : 'none',
      }}
    >
      <div className="speech-bubble-text" style={{ position: 'relative' }}>
        {translationDisplayMode === 'translationOnly' && translatedText ? (
          <span style={{ whiteSpace: 'pre-wrap' }}>{translatedText}</span>
        ) : (
          <>
            <span style={{ whiteSpace: 'pre-wrap' }}>{text}</span>
            {isActive && (
              <span className="speech-bubble-cursor" style={{ color: accentColor }}>
                ▌
              </span>
            )}

            {hasJapanese(text) && !translatedText && onTranslate && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onTranslate();
                }}
                disabled={isTranslating}
                style={{
                  background: 'none',
                  border: 'none',
                  color: accentColor,
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  padding: '2px',
                  marginLeft: '6px',
                  opacity: 0.6,
                  transition: 'opacity 0.2s',
                  verticalAlign: 'middle',
                }}
                onMouseOver={(e) => e.currentTarget.style.opacity = '1'}
                onMouseOut={(e) => e.currentTarget.style.opacity = '0.6'}
                title="Translate"
              >
                {isTranslating ? (
                  <Loader2 size={12} className="animate-spin" />
                ) : (
                  <Languages size={12} />
                )}
              </button>
            )}

            {translatedText && (
              <div style={{
                marginTop: '8px',
                paddingTop: '6px',
                borderTop: '1px dashed rgba(255, 255, 255, 0.2)',
                fontSize: '0.85em',
                color: 'rgba(255, 255, 255, 0.85)',
                fontStyle: 'italic',
                lineHeight: '1.4',
                whiteSpace: 'pre-wrap'
              }}>
                {translatedText}
              </div>
            )}
          </>
        )}

        {children}
      </div>
      <div
        className={`speech-bubble-tail speech-bubble-tail-${side}`}
        style={{ borderTopColor: accentColor }}
      />
    </div>
  );
};
