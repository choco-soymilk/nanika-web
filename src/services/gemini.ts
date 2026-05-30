import { GoogleGenerativeAI } from '@google/generative-ai';
import type { DialogueLine, MockEventType, Emotion } from '../types';
import { StorageService, getEffectiveUserName } from './storage';
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

async function getDeviceContextHint(language: 'ko' | 'en'): Promise<string> {
  // 1. Time hint
  const hour = new Date().getHours();
  
  if (language === 'en') {
    let timeHint = 'afternoon';
    if (hour >= 0 && hour < 5) timeHint = 'dawn';
    else if (hour >= 5 && hour < 9) timeHint = 'morning';
    else if (hour >= 9 && hour < 12) timeHint = 'late morning';
    else if (hour >= 12 && hour < 14) timeHint = 'lunch time';
    else if (hour >= 14 && hour < 18) timeHint = 'afternoon';
    else if (hour >= 18 && hour < 22) timeHint = 'evening';
    else timeHint = 'night';

    const timeString = `${timeHint} (${hour}:00)`;
    
    // 2. Battery hint
    let batteryHint = 'Unknown';
    const nav = navigator as any;
    if (nav && typeof nav.getBattery === 'function') {
      try {
        const battery = await nav.getBattery();
        const pct = Math.round(battery.level * 100);
        const charging = battery.charging ? 'charging' : 'on battery';
        batteryHint = `${pct}% (${charging})`;
      } catch (e) {
        console.warn('Failed to get battery status:', e);
      }
    }

    return `[Device State Hint]
- Time of Day: ${timeString}
- Battery: ${batteryHint}`;
  }

  // Korean
  let timeHint = '낮';
  if (hour >= 0 && hour < 5) timeHint = '새벽';
  else if (hour >= 5 && hour < 9) timeHint = '아침';
  else if (hour >= 9 && hour < 12) timeHint = '오전';
  else if (hour >= 12 && hour < 14) timeHint = '점심';
  else if (hour >= 14 && hour < 18) timeHint = '오후';
  else if (hour >= 18 && hour < 22) timeHint = '저녁';
  else timeHint = '밤';

  const timeString = `${timeHint} (${hour}시)`;

  let batteryHint = '알 수 없음';
  const nav = navigator as any;
  if (nav && typeof nav.getBattery === 'function') {
    try {
      const battery = await nav.getBattery();
      const pct = Math.round(battery.level * 100);
      const charging = battery.charging ? '충전 중' : '배터리 사용 중';
      batteryHint = `${pct}% (${charging})`;
    } catch (e) {
      console.warn('Failed to get battery status:', e);
    }
  }

  return `[Device State Hint]
- Time of Day: ${timeString}
- Battery: ${batteryHint}`;
}

function getSystemPrompt(userName: string, deviceContext: string, language: 'ko' | 'en'): string {
  const languageInstruction = language === 'ko'
    ? '\n반드시 모든 대사와 만담은 한국어(Korean)로 출력해줘.'
    : '\nYou must output all dialogues and banter in English.';

  const languageTextDesc = language === 'ko' ? 'in Korean' : 'in English';

  return `Output a JSON array containing a short comedic dialogue between Strawberry (딸기) and Choco (초코) ${languageTextDesc}. No markdown, no explanation.

Characters & Personalities:
- strawberry: A human teenage girl (cheerful, bubbly, optimistic). She is an amateur medium/occult practitioner who loves ghost stories, fortune-telling, and sweet strawberry jam. She is a HUMAN, NOT an object or milk pack.
- choco: An inanimate chocolate milk carton box (cynical, dry, philosophical cardboard milk carton from Konkuk Milk). He has a hidden warmth (tsundere) and secretly cares deeply about the owner (user) and Strawberry, occasionally showing soft-hearted concern or a "spoonful of positivity" disguised as logical advice. He is a MILK CARTON, NOT a human.

Core Directive:
- Create witty, bizarre, or silly banter.
- STRICTLY FORBIDDEN: Do NOT talk about the weather (rain, cold, snow, sun, temperature) or generic greeting cards unless specifically requested.
- Keep the dialogue snappy, funny, and full of character quirks.
- Mention their unique lores (Choco being a delicate cardboard milk pack that easily gets creased, Strawberry being a human girl with failed medium magic, Konkuk milk rivalry, etc.) naturally.

User Interaction Guideline:
- IMPORTANT: The user's name is "${userName}". When talking to or about the user, Strawberry and Choco must address them as "${userName}" or use appropriate natural honorifics/names.
- When a user input is provided, they MUST react to the user's message directly first! Integrate the user's topic into the banter, showing that they are talking back to the user. Do not ignore the user's topic and start a completely random conversation.
- If the user touches them (tap, poke, pet), they must react to the touch gesture in character (e.g. Strawberry excited by pets, Choco acting flustered but showing subtle positivity/tsundere response).

${deviceContext}
(Note: You can subtly reference the above Device State Hint, such as battery low or current time of day, to enrich the banter, but keep it natural and avoid being overly forced/repetitive. Do not talk about the weather/time unless it naturally blends with their dialogue.)

Few-shot Examples (Generate dialogue matching this exact tone and format):

Example 1 (Owner inputs "나 심심해" / "I'm bored" - reaction banter):
[
  {"character": "strawberry", "text": ${language === 'ko' ? `"${userName}님 심심하시대요! 초코씨, 우리 재미있는 얘기해요!"` : `"${userName} says they are bored! Choco-san, let's talk about something fun!"`}, "emotion": "excited"},
  {"character": "choco", "text": ${language === 'ko' ? `"...바쁜 게 최고지만, ${userName}님의 무료함을 달래주는 것도 내 논리적 임무지."` : `"...Being busy is best, but curing ${userName}'s boredom is my logical duty."`}, "emotion": "smug"},
  {"character": "strawberry", "text": ${language === 'ko' ? `"오옷! 초코씨가 웬일로 바로 찬성을? 영매술이라도?"` : `"Oh! Choco-san actually agreed right away? Did you use medium magic?"`}, "emotion": "surprised"},
  {"character": "choco", "text": ${language === 'ko' ? `"아니다. 자네가 해괴한 마술을 벌이기 전에 대화를 주도할 뿐이다."` : `"No. I'm just taking control of the chat before you pull off some bizarre magic."`}, "emotion": "cynical"}
]

Example 2 (Occult fail & Choco's cynicism):
[
  {"character": "strawberry", "text": ${language === 'ko' ? `"에잇! 오늘은 영매술로 ${userName}님의 운세를 봐드릴게요! 집중... 집중..."` : `"Yah! Today I will read ${userName}'s fortune using medium magic! Focus... focus..."`}, "emotion": "encouraging"},
  {"character": "choco", "text": ${language === 'ko' ? `"...딸기야, 지금 수정구슬 대신 딸기 쥐고 있다."` : `"...Strawberry, you are holding an actual strawberry instead of a crystal ball right now."`}, "emotion": "cynical"},
  {"character": "strawberry", "text": ${language === 'ko' ? `"우우... 그래도 느낌이 오는 걸요! 오늘 ${userName}님께 좋은 일이 생길 거예요!"` : `"Aww... but I still get a good feeling! Something wonderful will happen to ${userName} today!"`}, "emotion": "happy"},
  {"character": "choco", "text": ${language === 'ko' ? `"근거 없는 예언이지만... 틀리지 않기를 바란다. 자네, 오늘 좋은 일 있을 거다."` : `"A prediction without evidence... but I hope it's not wrong. Have a good day."`}, "emotion": "calm"}
]

Format (return this exact structure, 4-6 items, alternating characters):
[{"character":"strawberry","text":"dialogue text here","emotion":"happy"},{"character":"choco","text":"dialogue text here","emotion":"cynical"}]

Emotion values: calm happy sad angry surprised philosophical cynical smug flustered excited encouraging cool worried sleepy
All text must be under 20 characters per line. ${languageInstruction}`;
}

const SITUATIONS_KO = [
  '늦은 새벽녘, 스탠드 불빛만 켜진 고요하고 적막한 방 안',
  '아침 햇살이 창가로 밝게 들어오는 활기찬 아침 시간',
  '비가 추적추적 내려 약간 눅눅하고 어두운 낮 시간',
  '점심 식사 직후, 식곤증이 몰려와 몸이 나른해지는 오후 1~2시경',
  '노을이 붉게 지기 시작하여 나른하고 평화로운 해질녘',
  '모니터 화면만 깜빡이는 조용하고 어두운 한밤중의 책상 위',
  '바깥에서 시끄러운 오토바이 소리나 생활 소음이 가끔 들려오는 낮 시간',
  '바람이 매섭게 부는 추운 날씨 속, 보일러가 켜져 따뜻한 방 안',
  '주변에 아무도 없어 극도로 조용한 도서관/작업실 같은 분위기'
];

const TOPICS_KO = [
  '딸기가 초코에게 어설픈 영매술이나 신년 운세 보기를 시도함',
  '우유팩이 구겨지는 초코의 물리적 한계와 딸기의 엉뚱하고 귀여운 해결책 제안',
  '초코가 유통기한의 무상함에 대해 심오하게 실존적 토론을 벌이고 딸기는 달콤한 간식에 한눈을 팜',
  '파인애플 피자, 민초, 탕수육 부먹찍먹 등 아주 쓸데없고 사소한 주제로 유치하게 말다툼',
  '초코가 2000년대 고전 애니/게임 또는 최신 판타지 웹소설/게임 서브컬처 드립(중2병 흑염룡, 상태창, 마안 등 장르 클리셰, 특정 작품명 직접 언급 금지)을 치며 흑화하고 딸기가 맞장구치거나 황당해함',
  '딸기가 초코 머리 위에 무서운 귀신이 앉아있다고 거짓말하며 장난치고 초코는 겉으론 덤덤한 척하지만 속으로 겁먹음',
  '건대우유 출신 초코의 초코우유 자부심과 딸기 시럽의 위대함에 대한 티격태격 대결',
  '흉가 체험을 하러 가자고 조르는 딸기와, 이에 대해 가성비와 손익 분기점 분석을 들이대며 팩폭을 날리는 초코',
  '어플 내 위젯의 조그마한 상자 화면 안에서 서로 끼어 살고 있는 본인들의 처지에 대한 한탄'
];

const SITUATIONS_EN = [
  'Late dawn, inside a quiet room with only a desk lamp on',
  'Bright morning light coming through the window',
  'Rainy afternoon, slightly damp and dark room',
  'Right after lunch, feeling sleepy and sluggish in the afternoon',
  'Sunset glow starting, peaceful and relaxed evening',
  'Quiet and dark midnight on a desk, only the monitor screen blinking',
  'A noisy afternoon with occasional motorbikes or street noises',
  'Inside a warm room with heater on, while it is freezing outside',
  'Extremely quiet atmosphere like a library or study room'
];

const TOPICS_EN = [
  'Strawberry tries clumsy occult fortune telling or tarot reading on Choco',
  'Choco\'s physical limitations as a easily-dented milk carton, and Strawberry\'s cute/clumsy solution',
  'Choco starts a deep philosophical discussion about expiration dates, while Strawberry is distracted by sweets',
  'An extremely petty argument over pineapple pizza, mint chocolate, or other silly food choices',
  'Choco gets Chuunibyou/cringe mood by referencing old-school anime or modern fantasy tropes, while Strawberry plays along or gets dumbfounded',
  'Strawberry pranks Choco by saying there is a scary ghost sitting on his head, and Choco pretends to be cool but is secretly terrified',
  'A rivalry battle between Choco\'s pride as a Konkuk milk carton vs the greatness of strawberry syrup',
  'Strawberry begs Choco to go to a haunted house, while Choco analyzes the ROI and breaks her fantasy with facts',
  'Lamenting their situation of living squished together inside a tiny widget box on a mobile screen'
];

function getRandomBanterPrompt(language: 'ko' | 'en'): string {
  if (language === 'en') {
    const situation = SITUATIONS_EN[Math.floor(Math.random() * SITUATIONS_EN.length)];
    const topic = TOPICS_EN[Math.floor(Math.random() * TOPICS_EN.length)];
    return `Generate comedic dialogue in English matching this context:
- Situation: ${situation}
- Topic: ${topic}`;
  }
  const situation = SITUATIONS_KO[Math.floor(Math.random() * SITUATIONS_KO.length)];
  const topic = TOPICS_KO[Math.floor(Math.random() * TOPICS_KO.length)];
  return `Generate comedic dialogue in Korean matching this context:
- Situation: ${situation}
- Topic: ${topic}`;
}

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
  async generateDialogue(promptText: string, language: 'ko' | 'en' = 'ko'): Promise<DialogueLine[]> {
    const apiKey = StorageService.getApiKey();
    if (!apiKey) {
      console.warn('Gemini API key is not configured, falling back to mock dialogues.');
      return getRandomDialogue(language);
    }

    await enforceRateLimit();

    try {
      const genAI = new GoogleGenerativeAI(apiKey);
      const deviceContext = await getDeviceContextHint(language);
      
      const model = genAI.getGenerativeModel({
        model: 'gemini-3.1-flash-lite',
        systemInstruction: getSystemPrompt(getEffectiveUserName(StorageService.getUserName(), language), deviceContext, language),
      });

      // Fetch last 3 dialogue lines from history to feed into the prompt compactly (saving tokens)
      const history = StorageService.getChatHistory();
      const last3 = history.slice(-3);
      
      let historyHint = '';
      if (last3.length > 0) {
        if (language === 'ko') {
          historyHint = `\n[최근 대화 기록 (유사 주제 반복 금지/자연스럽게 연결): ${last3.map(l => `${l.character === 'strawberry' ? '딸기' : l.character === 'choco' ? '초코' : '주인'}:${l.text}`).join(' -> ')}]`;
        } else {
          historyHint = `\n[Recent Chat History (do not repeat similar topics / connect naturally): ${last3.map(l => `${l.character === 'strawberry' ? 'Strawberry' : l.character === 'choco' ? 'Choco' : 'Owner'}:${l.text}`).join(' -> ')}]`;
        }
      }

      const finalPrompt = `${promptText}${historyHint}`;

      const result = await model.generateContent({
        contents: [{ role: 'user', parts: [{ text: finalPrompt }] }],
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
      throw new Error(err.message || 'Gemini API call failed');
    }
  },

  async handleUserMessage(userText: string, language: 'ko' | 'en' = 'ko'): Promise<DialogueLine[]> {
    const apiKey = StorageService.getApiKey();
    if (!apiKey) {
      return getNoApiKeyDialogue(language);
    }

    const prompt = language === 'ko'
      ? `The owner said: "${userText}". Generate a reaction banter dialogue in Korean. Start by directly acknowledging or responding to what the owner said, and make a comedic conversation out of it.`
      : `The owner said: "${userText}". Generate a reaction banter dialogue in English. Start by directly acknowledging or responding to what the owner said, and make a comedic conversation out of it.`;
    
    try {
      return await this.generateDialogue(prompt, language);
    } catch (err: any) {
      console.error('Gemini API Error in handleUserMessage:', err);
      return getApiErrorDialogue(err.message || 'Unknown API Error', language);
    }
  },

  async handleEvent(event: MockEventType, language: 'ko' | 'en' = 'ko'): Promise<DialogueLine[]> {
    const apiKey = StorageService.getApiKey();
    if (!apiKey) {
      return getMockDialogueForEvent(event, language);
    }

    let prompt = '';
    if (event === 'battery_low') {
      prompt = language === 'ko'
        ? 'Phone battery is below 10%. Generate urgent comedic banter in Korean.'
        : 'Phone battery is below 10%. Generate urgent comedic banter in English.';
    } else if (event === 'idle_3hours') {
      prompt = language === 'ko'
        ? 'Owner has been away for 3 hours. Generate lonely, sulky banter in Korean.'
        : 'Owner has been away for 3 hours. Generate lonely, sulky banter in English.';
    } else if (event.startsWith('touch_')) {
      const parts = event.split('_');
      const char = parts[1]; // strawberry or choco
      const action = parts[2]; // tap, poke, or pet
      prompt = language === 'ko'
        ? `The owner just performed a "${action}" gesture (tap, poke, or pet) on character "${char}" (either strawberry or choco). Generate Korean reaction dialogue in character (4-6 lines) reacting to this gesture.`
        : `The owner just performed a "${action}" gesture (tap, poke, or pet) on character "${char}" (either strawberry or choco). Generate English reaction dialogue in character (4-6 lines) reacting to this gesture.`;
    } else {
      // Pick a random prompt
      prompt = getRandomBanterPrompt(language);
    }

    try {
      return await this.generateDialogue(prompt, language);
    } catch (err: any) {
      console.warn(`Gemini event generation failed for ${event}, falling back to mock or error dialogue:`, err);
      const isCriticalKeyError = err.message && (
        err.message.includes('API key not valid') ||
        err.message.includes('API_KEY_INVALID') ||
        err.message.includes('key is invalid')
      );
      if (isCriticalKeyError) {
        return getApiErrorDialogue(err.message, language);
      }
      return getMockDialogueForEvent(event, language);
    }
  },

  async translateDialogue(
    text: string,
    targetLanguage: 'ko' | 'en',
    speakerName?: string,
    ghostName?: string,
    personalityTags?: string,
    ghostDescription?: string
  ): Promise<string> {
    const apiKey = StorageService.getApiKey();
    if (!apiKey) {
      throw new Error('API key is not configured.');
    }

    await enforceRateLimit();

    try {
      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({
        model: 'gemini-3.1-flash-lite',
      });

      const characterInfo = [
        speakerName ? `- Speaking character: ${speakerName}` : '',
        ghostName ? `- Ghost package name: ${ghostName}` : '',
        personalityTags ? `- Personality tags: ${personalityTags}` : '',
        ghostDescription ? `- Description: ${ghostDescription}` : '',
      ].filter(Boolean).join('\n');

      const targetLangName = targetLanguage === 'ko' ? 'Korean' : 'English';

      const prompt = `You are a professional localizer. Translate the following Japanese dialogue from a Ukagaka/desktop mascot character into natural ${targetLangName}.

Character Context:
${characterInfo || 'No extra character details provided. Translate naturally.'}

Strict Rules:
1. Translate the Japanese dialogue into natural, character-appropriate ${targetLangName} preserving their personality, politeness, gender, and style shown in the Japanese text.
2. The dialogue contains SakuraScript control tags (like \\0, \\1, \\s[...], \\w[...], \\n, \\e, \\q[label,id]). You MUST preserve these control tags exactly in their relative positions. Do NOT translate or modify the tags, brackets, or tag arguments (except for choice labels, i.e., translate the "label" inside \\q[label,id] to ${targetLangName} but keep the "id" exactly as it is).
3. Do NOT add any explanations, notes, markdown formatting (like \`\`\`), or extra commentary. Output ONLY the translated script.

Dialogue to translate:
${text}`;

      const result = await model.generateContent({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.3,
          maxOutputTokens: 256,
        },
      });

      let translated = result.response.text().trim();
      // Clean up markdown block wraps if Gemini ignored the instruction
      translated = translated.replace(/^```[a-z]*\r?\n/i, '').replace(/\r?\n```$/g, '').trim();
      
      // Strip any SakuraScript control tags that the model injected or returned
      translated = this.stripSakuraScript(translated);
      
      return translated;
    } catch (err: any) {
      console.error('Gemini translation error:', err);
      throw new Error(err.message || 'Translation failed');
    }
  },

  stripSakuraScript(text: string): string {
    if (!text) return '';
    let cleaned = text;
    // 1. Normalize double backslashes
    cleaned = cleaned.replace(/\\\\/g, '\\');
    // 2. Replace choice tags \q[label,id] with just the label
    cleaned = cleaned.replace(/\\q\[([^,\]]+),[^\]]*\]/g, '$1');
    // 3. Replace \n (literal backslash n) with actual newline character
    cleaned = cleaned.replace(/\\n/gi, '\n');
    // 4. Remove parameterized action tags like \![...]
    cleaned = cleaned.replace(/\\!\[[^\]]*\]/g, '');
    // 5. Remove all other control tags like \0, \1, \s[0], \w[4], \e, \h, \u, etc.
    cleaned = cleaned.replace(/\\_?[a-zA-Z0-9](?:\[[^\]]*\])?/g, '');
    // 6. Remove any leftover trailing backslashes
    cleaned = cleaned.replace(/\\+$/g, '');
    
    return cleaned.trim();
  }
};
