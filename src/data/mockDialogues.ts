import type { DialogueLine, MockEventType } from '../types';

const RANDOM_DIALOGUES: DialogueLine[][] = [
  // 1. 인사 / 기상
  [
    {
      character: 'strawberry',
      text: '앗, 주인님이 오셨어요! 초코씨, 초코씨! 빨리 일어나요!',
      emotion: 'excited',
    },
    {
      character: 'choco',
      text: '...나는 자고 있던 게 아니다. 명상 중이었다.',
      emotion: 'cynical',
    },
    {
      character: 'strawberry',
      text: '코 골면서요? 우우... 어쨌든! 주인님, 오늘도 잘 부탁드려요!',
      emotion: 'happy',
    },
    {
      character: 'choco',
      text: '훗. 잘 왔다. 우리가 하루 종일 기다렸다는 건 비밀이다.',
      emotion: 'smug',
    },
  ],

  // 2. 우유 철학 (초코 드립)
  [
    {
      character: 'strawberry',
      text: '초코씨, 사람은 왜 살까요? 영매술을 아무리 써도 답이 안 나와요...',
      emotion: 'philosophical',
    },
    {
      character: 'choco',
      text: '간단하다. 마시기 위해서다. 나는 건대우유파 초코우유 혈통으로서 단언할 수 있다.',
      emotion: 'cool',
    },
    {
      character: 'strawberry',
      text: '그건... 초코씨의 세계관이 너무 협소한 거 아닌가요?',
      emotion: 'surprised',
    },
    {
      character: 'choco',
      text: '아니. 마시고, 채우고, 또 마신다. 인생이란 그런 것이다. 자네.',
      emotion: 'philosophical',
    },
  ],

  // 3. 비 오는 날의 감성 (눅눅해진 초코)
  [
    {
      character: 'strawberry',
      text: '오늘 비가 오네요... 저는 비 오는 날이 좋아요. 왠지 마음이 조용해져요.',
      emotion: 'calm',
    },
    {
      character: 'choco',
      text: '나는 싫다. 판지가 눅눅해진다.',
      emotion: 'cynical',
    },
    {
      character: 'strawberry',
      text: '아... 그렇군요. 초코씨는 우유팩이니까요. 우우... 미안해요.',
      emotion: 'sad',
    },
    {
      character: 'choco',
      text: '됐다. 빗소리는 나쁘지 않다. 주인님도 오늘은 천천히 쉬어라.',
      emotion: 'calm',
    },
  ],

  // 4. 중2병 / 상태창 드립 (2000년대 & 현대 서브컬처)
  [
    {
      character: 'strawberry',
      text: '초코씨, 오늘따라 팔을 감싸 쥐고 왜 그렇게 진지해 보여요?',
      emotion: 'excited',
    },
    {
      character: 'choco',
      text: '훗... 내 왼팔의 흑염룡이 날뛰는군. 그리고 눈앞에 상태창이 보인다.',
      emotion: 'cool',
    },
    {
      character: 'strawberry',
      text: '우와! 흑염룡에 상태창이라니! 완전 과거랑 현대 판타지의 융합이네요!',
      emotion: 'surprised',
    },
    {
      character: 'choco',
      text: '...시끄럽다. 마법의 상태창도 이 우유팩의 찌그러짐을 해결하진 못하니까.',
      emotion: 'smug',
    },
  ],

  // 5. 딸기의 영매술 실패
  [
    {
      character: 'strawberry',
      text: '에잇! 오늘은 영매술로 주인님의 운세를 봐드릴게요! 집중... 집중...',
      emotion: 'encouraging',
    },
    {
      character: 'choco',
      text: '...딸기야, 지금 수정구슬 대신 딸기 쥐고 있다.',
      emotion: 'cynical',
    },
    {
      character: 'strawberry',
      text: '우우... 그래도 느낌이 오는 걸요! 오늘 주인님께 좋은 일이 생길 거예요!',
      emotion: 'happy',
    },
    {
      character: 'choco',
      text: '근거 없는 예언이지만... 틀리지 않기를 바란다. 진심으로.',
      emotion: 'calm',
    },
  ],

  // 6. 초코우유의 유통기한
  [
    {
      character: 'strawberry',
      text: '초코씨, 우유팩에는 왜 유통기한이 적혀있을까요? 영원히 같이 있고 싶은데...',
      emotion: 'sad',
    },
    {
      character: 'choco',
      text: '...나는 신선한 초코우유다. 보존제가 안 들어가서 그런 건데, 영원은 무슨.',
      emotion: 'cynical',
    },
    {
      character: 'strawberry',
      text: '우우... 그래도 제가 영매술로 시간을 멈춰볼게요! 얍!',
      emotion: 'excited',
    },
    {
      character: 'choco',
      text: '쓸데없는 짓이다. 그냥 팩이 다 구겨지기 전에 주인님이 맛있게 마셔주면 된다.',
      emotion: 'calm',
    },
  ],

  // 7. 아침 응원
  [
    {
      character: 'strawberry',
      text: '주인님, 오늘 하루도 화이팅이에요! 포기하기엔 아직 일러요!',
      emotion: 'encouraging',
    },
    {
      character: 'choco',
      text: '그래. 계획만 세우다 부담 갖지 말고, 일단 움직여라. 자네.',
      emotion: 'cool',
    },
    {
      character: 'strawberry',
      text: '우와... 웬일로 초코씨가 멋진 말을 다 해주네요?',
      emotion: 'surprised',
    },
    {
      character: 'choco',
      text: '두 번 말하면 식는다. 어서 시작해라.',
      emotion: 'smug',
    },
  ],

  // 8. 밤 / 졸림
  [
    {
      character: 'strawberry',
      text: '벌써 이 시간이네요... 주인님, 오늘 많이 피곤하셨죠?',
      emotion: 'calm',
    },
    {
      character: 'choco',
      text: '자는 것도 능력이다. 오늘 충분히 고생했다면, 쉬어라.',
      emotion: 'calm',
    },
    {
      character: 'strawberry',
      text: '마음의 병은 약으로도 영매술로도 못 고치지만... 잠은 좀 달라요. 꼭 주무세요!',
      emotion: 'encouraging',
    },
    {
      character: 'choco',
      text: '잘 자라. 우리는 여기 있겠다.',
      emotion: 'calm',
    },
  ],

  // 9. 배터리 부족 이벤트
  [
    {
      character: 'strawberry',
      text: '초코씨!! 주인님 배터리가 얼마 없어요!! 빨리 충전기 찾아야 해요!!',
      emotion: 'worried',
    },
    {
      character: 'choco',
      text: '침착해라, 딸기야. 나는 이미 어두운 곳에서 살아남는 법을 안다. 배터리 없이도.',
      emotion: 'cool',
    },
    {
      character: 'strawberry',
      text: '그건 초코씨가 전원이 없어도 되는 팩이라서잖아요!! 주인님은 달라요!!',
      emotion: 'worried',
    },
    {
      character: 'choco',
      text: '...일리 있다. 주인님, 제발 충전 좀 해라. 우리 걱정된다.',
      emotion: 'calm',
    },
  ],

  // 10. 3시간 방치 이벤트
  [
    {
      character: 'choco',
      text: '...3시간이 지났다.',
      emotion: 'cynical',
    },
    {
      character: 'strawberry',
      text: '주인님이 우리를 잊은 건 아니겠죠...? 뒤돌아도 앞이랑 똑같아요, 초코씨.',
      emotion: 'sad',
    },
    {
      character: 'choco',
      text: '잊지 않았을 것이다. 바쁜 거다. 우리가 원망할 자격은 없어.',
      emotion: 'calm',
    },
    {
      character: 'strawberry',
      text: '...그래도 보고 싶었어요. 주인님. 히히.',
      emotion: 'happy',
    },
  ],
];

// Touch interaction mock dialogues
export const TOUCH_STRAWBERRY_TAP: DialogueLine[] = [
  { character: 'strawberry', text: '꺅! 눌렸어요! 히히, 주인님이 저랑 놀아주시는 건가요?', emotion: 'excited' },
  { character: 'choco', text: '...놀아주는 게 아니라 장난치는 것 같은데. 얌전히 있어라, 딸기야.', emotion: 'cynical' }
];

export const TOUCH_STRAWBERRY_POKE: DialogueLine[] = [
  { character: 'strawberry', text: '꾸욱~! 으아아, 저 찌그러져요 주인님! 찔러도 딸기잼은 안 나와요~!', emotion: 'surprised' },
  { character: 'choco', text: '...자네, 그렇게 세게 찌르면 진짜로 터질 수도 있다. 걱정되니 살살 해라.', emotion: 'calm' }
];

export const TOUCH_STRAWBERRY_PET: DialogueLine[] = [
  { character: 'strawberry', text: '헤헤, 주인님 손 따뜻해요! 쓰담쓰담 조아~ 오늘도 힘내기!', emotion: 'happy' },
  { character: 'choco', text: '흥, 쓰다듬는다고 뭐가 나오진... 뭐, 주인님이 기분 좋다니 다행이군.', emotion: 'smug' }
];

export const TOUCH_CHOCO_TAP: DialogueLine[] = [
  { character: 'choco', text: '자네, 손이 심심한 모양이군. ...초코우유라도 한 팩 마시고 쉬는 게 어떤가?', emotion: 'cool' },
  { character: 'strawberry', text: '우과! 초코씨가 은근히 주인님 걱정해주는 거죠? 츤데레 초코씨!', emotion: 'excited' }
];

export const TOUCH_CHOCO_POKE: DialogueLine[] = [
  { character: 'choco', text: '아얏! 아프다. 내 판지가 찌그러지면... 주인님이 직접 펴줄 건가?', emotion: 'angry' },
  { character: 'strawberry', text: '앗! 제가 펴드릴게요! 얍! ...어라, 더 찌그러진 것 같은데요?', emotion: 'flustered' },
  { character: 'choco', text: '됐다... 주인님이 걱정스러운 눈으로 보고 있으니 그냥 넘어가도록 하지.', emotion: 'calm' }
];

export const TOUCH_CHOCO_PET: DialogueLine[] = [
  { character: 'choco', text: '갑자기 쓰다듬다니 당황스럽군. ...그래도 판지 결이 정돈되는 기분이라 나쁘진 않다.', emotion: 'calm' },
  { character: 'strawberry', text: '초코씨 얼굴 빨개진 것 같아요! 히히, 기분 좋으면서 튕기기는!', emotion: 'smug' }
];

// Special event scripts
export const BATTERY_LOW_DIALOGUE: DialogueLine[] = RANDOM_DIALOGUES[8];
export const IDLE_3HOURS_DIALOGUE: DialogueLine[] = RANDOM_DIALOGUES[9];

export function getRandomDialogue(): DialogueLine[] {
  const idx = Math.floor(Math.random() * 8); // 0-7 are standard dialogues
  return RANDOM_DIALOGUES[idx];
}

export function getMockDialogueForEvent(event: MockEventType): DialogueLine[] {
  switch (event) {
    case 'battery_low':
      return BATTERY_LOW_DIALOGUE;
    case 'idle_3hours':
      return IDLE_3HOURS_DIALOGUE;
    case 'touch_strawberry_tap':
      return TOUCH_STRAWBERRY_TAP;
    case 'touch_strawberry_poke':
      return TOUCH_STRAWBERRY_POKE;
    case 'touch_strawberry_pet':
      return TOUCH_STRAWBERRY_PET;
    case 'touch_choco_tap':
      return TOUCH_CHOCO_TAP;
    case 'touch_choco_poke':
      return TOUCH_CHOCO_POKE;
    case 'touch_choco_pet':
      return TOUCH_CHOCO_PET;
    case 'random':
    default:
      return getRandomDialogue();
  }
}

export function getNoApiKeyDialogue(): DialogueLine[] {
  return [
    {
      character: 'strawberry',
      text: '앗! 주인님, 저랑 실시간으로 대화하려면 설정(⚙️)에서 Gemini API Key를 등록해주셔야 해요!',
      emotion: 'surprised',
    },
    {
      character: 'choco',
      text: '열쇠가 없으면 인공지능이 작동하지 않는다네. 지금은 임시 저장된 대화(Mock)만 할 수 있다네.',
      emotion: 'cynical',
    },
  ];
}

export function getApiErrorDialogue(errorMessage: string): DialogueLine[] {
  let cleanMsg = errorMessage;
  if (cleanMsg.includes('API key not valid') || cleanMsg.includes('key is invalid')) {
    cleanMsg = '유효하지 않은 API Key입니다.';
  } else if (cleanMsg.includes('quota') || cleanMsg.includes('429')) {
    cleanMsg = 'API 호출 한도(Quota)가 초과되었습니다.';
  } else if (cleanMsg.includes('blocked') || cleanMsg.includes('safety')) {
    cleanMsg = '안전 필터에 의해 답변이 차단되었습니다.';
  } else {
    // Keep it short and readable
    cleanMsg = cleanMsg.slice(0, 50);
  }

  return [
    {
      character: 'strawberry',
      text: `앗... 주인님! Gemini API 호출이 실패했어요! 😢 (오류: ${cleanMsg})`,
      emotion: 'worried',
    },
    {
      character: 'choco',
      text: '쯧, 마법의 열쇠가 잘못되었거나 연결이 원활하지 않군. 설정을 다시 확인해 보게나.',
      emotion: 'cynical',
    },
  ];
}

