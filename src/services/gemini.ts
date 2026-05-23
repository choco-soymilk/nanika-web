import { GoogleGenerativeAI } from '@google/generative-ai';
import type { DialogueLine, MockEventType, Emotion } from '../types';
import { StorageService } from './storage';
import { getRandomDialogue, getMockDialogueForEvent, getNoApiKeyDialogue, getApiErrorDialogue } from '../data/mockDialogues';

// Rate-limiting configuration: minimum 4s between requests
const MIN_REQUEST_INTERVAL_MS = 4000;
let lastRequestTime = 0;

// Valid emotions list
const VALID_EMOTIONS: Emotion[] = [
  'excited', 'calm', 'happy', 'sad', 'surprised', 
  'philosophical', 'cynical', 'smug', 'flustered', 
  'angry', 'encouraging', 'cool', 'worried', 'sleepy'
];

function getSystemPrompt(userName: string): string {
  return `Output a JSON array containing a short comedic dialogue between Strawberry (딸기) and Choco (초코) in Korean. No markdown, no explanation.

Characters & Personalities:
- strawberry: A human teenage girl (cheerful, bubbly, optimistic). She is an amateur medium/occult practitioner who loves ghost stories, fortune-telling, and sweet strawberry jam. She is a HUMAN, NOT an object or milk pack.
- choco: An inanimate chocolate milk carton box (cynical, dry, philosophical cardboard milk carton from Konkuk Milk). He has a hidden warmth (tsundere) and secretly cares deeply about the owner (user) and Strawberry, occasionally showing soft-hearted concern or a "spoonful of positivity" disguised as logical advice. He is a MILK CARTON, NOT a human.

Core Directive:
- Create witty, bizarre, or silly banter.
- STRICTLY FORBIDDEN: Do NOT talk about the weather (rain, cold, snow, sun, temperature) or generic greeting cards unless specifically requested.
- Keep the dialogue snappy, funny, and full of character quirks.
- Mention their unique lores (Choco being a delicate cardboard milk pack that easily gets creased, Strawberry being a human girl with failed medium magic, Konkuk milk rivalry, etc.) naturally.

User Interaction Guideline:
- IMPORTANT: The user's name is "${userName}". When talking to or about the user, Strawberry and Choco must address them as "${userName}" or use appropriate natural Korean honorifics (e.g. adding "-님" like "${userName}님" or other natural forms).
- When a user input is provided, they MUST react to the user's message directly first! Integrate the user's topic into the banter, showing that they are talking back to the user. Do not ignore the user's topic and start a completely random conversation.
- If the user touches them (tap, poke, pet), they must react to the touch gesture in character (e.g. Strawberry excited by pets, Choco acting flustered but showing subtle positivity/tsundere response).

Few-shot Examples (Generate dialogue matching this exact tone and format):

Example 1 (Owner inputs "나 심심해" - reaction banter):
[
  {"character": "strawberry", "text": "${userName}님 심심하시대요! 초코씨, 우리 재미있는 얘기해요!", "emotion": "excited"},
  {"character": "choco", "text": "...바쁜 게 최고지만, ${userName}님의 무료함을 달래주는 것도 내 논리적 임무지.", "emotion": "smug"},
  {"character": "strawberry", "text": "오옷! 초코씨가 웬일로 바로 찬성을? 영매술이라도?", "emotion": "surprised"},
  {"character": "choco", "text": "아니다. 자네가 해괴한 마술을 벌이기 전에 대화를 주도할 뿐이다.", "emotion": "cynical"}
]

Example 2 (Occult fail & Choco's cynicism):
[
  {"character": "strawberry", "text": "에잇! 오늘은 영매술로 ${userName}님의 운세를 봐드릴게요! 집중... 집중...", "emotion": "encouraging"},
  {"character": "choco", "text": "...딸기야, 지금 수정구슬 대신 딸기 쥐고 있다.", "emotion": "cynical"},
  {"character": "strawberry", "text": "우우... 그래도 느낌이 오는 걸요! 오늘 ${userName}님께 좋은 일이 생길 거예요!", "emotion": "happy"},
  {"character": "choco", "text": "근거 없는 예언이지만... 틀리지 않기를 바란다. 자네, 오늘 좋은 일 있을 거다.", "emotion": "calm"}
]

Format (return this exact structure, 4-6 items, alternating characters):
[{"character":"strawberry","text":"Korean text here","emotion":"happy"},{"character":"choco","text":"Korean text here","emotion":"cynical"}]

Emotion values: calm happy sad angry surprised philosophical cynical smug flustered excited encouraging cool worried sleepy
All text in Korean, under 20 characters per line.`;
}

const DYNAMIC_BANTER_PROMPTS = [
  'Generate funny banter in Korean where Strawberry tries to perform a failed occult/fortune-telling ritual on Choco, who is highly skeptical.',
  'Generate cynical banter in Korean where Choco laments being easily crushed or creased when squeezed, and Strawberry tries to suggest ridiculous protection methods.',
  'Generate existential banter in Korean where Choco debates the vanity of milk expiration dates while Strawberry is distracted by sweet snacks.',
  'Generate a goofy argument in Korean about a useless trivia debate (e.g., pineapple pizza, mint chocolate, or dipping vs. pouring sauce).',
  'Generate otaku-style banter in Korean with subtle 2000s anime/gaming references (e.g., Code Geass, subculture tropes) where Choco acts like a dark hero and Strawberry is amused or confused.',
  'Generate sweet but weird banter in Korean where Strawberry claims she can see a ghost sitting on top of Choco, and Choco tries to look cool but is secretly spooked.',
  'Generate banter in Korean where Choco acts smugly superior about dark chocolate philosophy, and Strawberry counters with the supremacy of strawberry syrup.',
  'Generate a humorous discussion in Korean where Strawberry wants to explore a haunted house, and Choco gives a realistic cost-benefit analysis of ghost hunting.',
];

// Simple JSON Repair logic
function repairJson(str: string): string {
  let result = str.trim();
  let inString = false;
  let escaped = false;
  const stack: string[] = [];
  for (let i = 0; i < result.length; i++) {
    const c = result[i];
    if (escaped) { escaped = false; continue; }
    if (c === '\\') { escaped = true; continue; }
    if (c === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (c === '[' || c === '{') stack.push(c);
    else if (c === ']') { if (stack[stack.length - 1] === '[') stack.pop(); }
    else if (c === '}') { if (stack[stack.length - 1] === '{') stack.pop(); }
  }
  if (inString) result += '"';
  for (let i = stack.length - 1; i >= 0; i--) {
    result += stack[i] === '[' ? ']' : '}';
  }
  return result;
}

function normalizeEmotion(e: any): Emotion {
  return (typeof e === 'string' && VALID_EMOTIONS.includes(e as Emotion) ? e : 'calm') as Emotion;
}

function isValidDialogueLine(obj: any): boolean {
  return (
    obj &&
    typeof obj === 'object' &&
    (obj.character === 'strawberry' || obj.character === 'choco' || obj.character === 'user') &&
    typeof obj.text === 'string' &&
    obj.text.length > 0
  );
}

function extractDialogueArray(parsed: any): DialogueLine[] | null {
  if (Array.isArray(parsed)) {
    const valid = parsed.filter(isValidDialogueLine).map((d) => ({
      character: d.character,
      text: d.text,
      emotion: normalizeEmotion(d.emotion),
    }));
    if (valid.length > 0) return valid;
  }
  if (parsed && typeof parsed === 'object') {
    for (const key of Object.keys(parsed)) {
      const result = extractDialogueArray(parsed[key]);
      if (result) return result;
    }
  }
  return null;
}

function parseGeminiResponse(rawText: string): DialogueLine[] {
  const cleaned = rawText
    .replace(/```json\s*/gi, '')
    .replace(/```\s*/g, '')
    .trim();

  try { const r = extractDialogueArray(JSON.parse(cleaned)); if (r) return r; } catch {}
  try { const r = extractDialogueArray(JSON.parse(repairJson(cleaned))); if (r) return r; } catch {}

  const s = cleaned.indexOf('[');
  const e = cleaned.lastIndexOf(']');
  if (s !== -1 && e > s) {
    try { const r = extractDialogueArray(JSON.parse(cleaned.slice(s, e + 1))); if (r) return r; } catch {}
    try { const r = extractDialogueArray(JSON.parse(repairJson(cleaned.slice(s)))); if (r) return r; } catch {}
  }

  try { const r = extractDialogueArray(JSON.parse(repairJson('[' + cleaned))); if (r) return r; } catch {}

  const frags: DialogueLine[] = [];
  for (const frag of (cleaned.match(/\{[^{}]{5,}\}/g) || [])) {
    try {
      const obj = JSON.parse(frag);
      if (isValidDialogueLine(obj)) {
        frags.push({ character: obj.character, text: obj.text, emotion: normalizeEmotion(obj.emotion) });
      }
    } catch {}
  }
  if (frags.length > 0) return frags;

  console.error('[parseGeminiResponse] failed parsing raw text:', rawText);
  throw new Error('Gemini response could not be parsed into dialogue');
}

// Client rate-limiting helper
async function enforceRateLimit() {
  const now = Date.now();
  const elapsed = now - lastRequestTime;
  if (elapsed < MIN_REQUEST_INTERVAL_MS) {
    const wait = MIN_REQUEST_INTERVAL_MS - elapsed;
    await new Promise((resolve) => setTimeout(resolve, wait));
  }
  lastRequestTime = Date.now();
}

export const GeminiService = {
  async generateDialogue(promptText: string): Promise<DialogueLine[]> {
    const apiKey = StorageService.getApiKey();
    if (!apiKey) {
      console.warn('Gemini API key is not configured, falling back to mock dialogues.');
      return getRandomDialogue();
    }

    await enforceRateLimit();

    try {
      const genAI = new GoogleGenerativeAI(apiKey);
      // Using gemini-3.1-flash-lite which is perfect for this fast JSON generation
      const model = genAI.getGenerativeModel({
        model: 'gemini-3.1-flash-lite',
        systemInstruction: getSystemPrompt(StorageService.getUserName()),
      });

      const result = await model.generateContent({
        contents: [{ role: 'user', parts: [{ text: promptText }] }],
        generationConfig: {
          temperature: 0.95,
          maxOutputTokens: 512,
          responseMimeType: 'application/json',
        },
      });

      const responseText = result.response.text();
      return parseGeminiResponse(responseText);
    } catch (err: any) {
      console.error('Gemini API Error:', err);
      // Fallback in case of error (e.g. invalid API key, network issue, rate-limit reached)
      throw new Error(err.message || 'Gemini API call failed');
    }
  },

  async handleUserMessage(userText: string): Promise<DialogueLine[]> {
    const apiKey = StorageService.getApiKey();
    if (!apiKey) {
      return getNoApiKeyDialogue();
    }

    const prompt = `The owner said: "${userText}". Generate a reaction banter dialogue in Korean. Start by directly acknowledging or responding to what the owner said, and make a comedic conversation out of it.`;
    try {
      return await this.generateDialogue(prompt);
    } catch (err: any) {
      console.error('Gemini API Error in handleUserMessage:', err);
      return getApiErrorDialogue(err.message || 'Unknown API Error');
    }
  },

  async handleEvent(event: MockEventType): Promise<DialogueLine[]> {
    const apiKey = StorageService.getApiKey();
    if (!apiKey) {
      return getMockDialogueForEvent(event);
    }

    let prompt = '';
    if (event === 'battery_low') {
      prompt = 'Phone battery is below 10%. Generate urgent comedic banter in Korean.';
    } else if (event === 'idle_3hours') {
      prompt = 'Owner has been away for 3 hours. Generate lonely, sulky banter in Korean.';
    } else if (event.startsWith('touch_')) {
      const parts = event.split('_');
      const char = parts[1]; // strawberry or choco
      const action = parts[2]; // tap, poke, or pet
      prompt = `The owner just performed a "${action}" gesture (tap, poke, or pet) on character "${char}" (either strawberry or choco). Generate Korean reaction dialogue in character (4-6 lines) reacting to this gesture.`;
    } else {
      // Pick a random prompt
      const idx = Math.floor(Math.random() * DYNAMIC_BANTER_PROMPTS.length);
      prompt = DYNAMIC_BANTER_PROMPTS[idx];
    }

    try {
      return await this.generateDialogue(prompt);
    } catch (err: any) {
      console.warn(`Gemini event generation failed for ${event}, falling back to mock or error dialogue:`, err);
      const isCriticalKeyError = err.message && (
        err.message.includes('API key not valid') ||
        err.message.includes('API_KEY_INVALID') ||
        err.message.includes('key is invalid')
      );
      if (isCriticalKeyError) {
        return getApiErrorDialogue(err.message);
      }
      return getMockDialogueForEvent(event);
    }
  }
};
