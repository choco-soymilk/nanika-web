import React from 'react';
import type { Emotion } from '../types';

interface BubbleProps {
  text: string;
  emotion: Emotion;
  isActive: boolean;
  side: 'left' | 'right';
  children?: React.ReactNode;
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

export const SpeechBubble: React.FC<BubbleProps> = ({ text, emotion, isActive, side, children }) => {
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
      <div className="speech-bubble-text">
        {text}
        {isActive && (
          <span className="speech-bubble-cursor" style={{ color: accentColor }}>
            ▌
          </span>
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
