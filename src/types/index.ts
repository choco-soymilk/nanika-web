export type CharacterName = 'strawberry' | 'choco' | 'user';

export type Emotion =
  | 'excited'
  | 'calm'
  | 'happy'
  | 'sad'
  | 'surprised'
  | 'cynical'
  | 'angry'
  | 'encouraging'
  | 'cool'
  | 'smug'
  | 'worried'
  | 'sleepy'
  | 'philosophical'
  | 'flustered'; // added flustered since it appears in original dialogue/emotion configs

export interface DialogueLine {
  character: CharacterName;
  text: string;
  emotion: Emotion;
  timestamp?: number; // Optional timestamp for history tracking
}

export type MockEventType =
  | 'battery_low'
  | 'idle_3hours'
  | 'random'
  | 'touch_strawberry_tap'
  | 'touch_strawberry_poke'
  | 'touch_strawberry_pet'
  | 'touch_choco_tap'
  | 'touch_choco_poke'
  | 'touch_choco_pet';

export interface AppSettings {
  apiKey: string;
  banterInterval: number; // in seconds (e.g. 60, 120, 300)
  userName: string;
}
