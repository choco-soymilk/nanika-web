import type { VirtualFile } from './narExtractor';

export interface GhostMetadata {
  name: string;
  sakuraName: string;
  keroName: string;
  charset: string;
}

export class ShioriRunner {
  private ghostFiles: Record<string, VirtualFile> = {};
  private metadata: GhostMetadata = {
    name: 'Default Ghost',
    sakuraName: 'Sakura',
    keroName: 'Kero',
    charset: 'utf-8',
  };

  // Event name -> list of script strings
  private events: Record<string, string[]> = {};
  // Raw (unexpanded) Kawari key->value map for two-pass expansion
  private rawKawari: Record<string, string[]> = {};
  // Random talk list (from aitalk.txt)
  private randomTalks: string[] = [];
  // Misaka events map (with condition structures)
  private misakaEvents: Record<string, {
    script: string;
    conditionStr?: string;
    condition?: {
      refIndex: number;
      refValue: string;
      isNot?: boolean;
    };
  }[]> = {};

  private userName = 'Master';
  private strokeCounts: Record<string, number> = {};

  constructor(files: Record<string, VirtualFile>, userName?: string, defaultCharset?: string) {
    this.ghostFiles = files;
    if (userName) {
      this.userName = userName;
    }
    if (defaultCharset) {
      this.metadata.charset = defaultCharset;
    }
    this.parseGhost();
  }

  public isJapaneseGhost(): boolean {
    const charset = (this.metadata.charset || '').toLowerCase();
    if (charset.includes('jis') || charset.includes('sjis') || charset.includes('jp')) {
      return true;
    }
    const hasJapaneseChar = (str: string) => {
      for (let i = 0; i < str.length; i++) {
        const code = str.charCodeAt(i);
        if ((code >= 0x3040 && code <= 0x309F) || (code >= 0x30A0 && code <= 0x30FF)) {
          return true;
        }
      }
      return false;
    };
    return hasJapaneseChar(this.metadata.sakuraName) || hasJapaneseChar(this.metadata.keroName) || hasJapaneseChar(this.metadata.name);
  }

  private parseGhost() {
    // 1. Locate ghost/master/descript.txt
    let descriptContent = '';
    for (const [path, file] of Object.entries(this.ghostFiles)) {
      if (path.includes('ghost/master/') && path.endsWith('descript.txt')) {
        descriptContent = file.text || '';
        break;
      }
    }

    if (descriptContent) {
      const lines = descriptContent.split(/\r?\n/);
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('#')) continue;
        const commaIdx = trimmed.indexOf(',');
        if (commaIdx !== -1) {
          const key = trimmed.slice(0, commaIdx).trim().toLowerCase();
          const val = trimmed.slice(commaIdx + 1).trim();
          if (key === 'name') this.metadata.name = val;
          else if (key === 'sakura.name') this.metadata.sakuraName = val;
          else if (key === 'kero.name') this.metadata.keroName = val;
          else if (key === 'charset') this.metadata.charset = val;
        }
      }
    }

    // 2. Parse all text/dictionary files under ghost/master
    for (const [path, file] of Object.entries(this.ghostFiles)) {
      if (!path.includes('ghost/master/')) continue;
      const content = file.text;
      if (!content) continue;

      const lowerPath = path.toLowerCase();

      // Check if it is aitalk.txt (standard random dialogue file)
      if (lowerPath.endsWith('aitalk.txt')) {
        this.parseAitalk(content);
        continue;
      }

      // Parse as Satori/YAYA dictionary
      this.parseDictionary(content);

      // Parse as Kawari dictionary
      this.parseKawari(content);

      // Parse as Misaka dictionary
      this.parseMisaka(content);
    }

    // Merge standard talk events into randomTalks
    const talkEvents = [
      'OnAiTalk', 'Aitalk', 'OnAitalk', 'sentence', 'randomtalk',
      '_ontalkcore', '_ontalk', 'ontalk', 'ontalkcore'
    ];
    for (const event of talkEvents) {
      if (this.events[event]) {
        this.randomTalks.push(...this.events[event]);
        delete this.events[event];
      }

      const misakaKey = event.toLowerCase();
      if (this.misakaEvents[misakaKey]) {
        const scripts = this.misakaEvents[misakaKey].map(m => m.script);
        this.randomTalks.push(...scripts);
        delete this.misakaEvents[misakaKey];
      }
    }

    // We now expand Kawari variables dynamically at trigger-time for correct random choice selection

    // Add fallback scripts if empty to guarantee stability
    this.addFallbacks();
  }

  /**
   * Resolves ${VarName} references in all event scripts using the rawKawari map.
   * Runs up to 3 expansion passes to handle nested references.
   */
  private expandSingleKawariScript(script: string, refParts: string[] = []): string {
    const MAX_RESULT_LENGTH = 1000;
    // Allow slightly higher depth because variables can contain nested references
    const MAX_DEPTH = 10;

    const expand = (str: string, depth: number, expandingVars: Record<string, number>): string => {
      if (depth > MAX_DEPTH) return str;
      if (str.length > MAX_RESULT_LENGTH) return str.substring(0, MAX_RESULT_LENGTH);

      // Match ${varName} and {$varName} where varName can contain any Unicode non-whitespace chars
      return str.replace(/(?:\$\{([^{}\s]+)\}|\{\$([^{}\s]+)\})/g, (_match, varName1, varName2) => {
        const varName = varName1 || varName2;
        // Skip if this looks like an assignment or control statement
        if (/[=+\-!<>]/.test(varName)) return '';
        const lower = varName.toLowerCase();

        const alternatives = this.getEventScripts(lower, refParts);
        if (alternatives && alternatives.length > 0) {
          const count = expandingVars[lower] || 0;
          let val: string;

          if (count >= 2) {
            // Force select a base case that doesn't reference itself
            const baseCases = alternatives.filter(alt => {
              const altLower = alt.toLowerCase();
              return !altLower.includes(`\${${lower}}`) && !altLower.includes(`{$${lower}}`);
            });
            if (baseCases.length > 0) {
              val = baseCases[Math.floor(Math.random() * baseCases.length)];
            } else {
              return ''; // No base case to terminate, stop
            }
          } else {
            val = alternatives[Math.floor(Math.random() * alternatives.length)];
          }

          const nextVars = { ...expandingVars, [lower]: count + 1 };
          const expanded = expand(val, depth + 1, nextVars);
          return expanded.length > MAX_RESULT_LENGTH ? expanded.substring(0, MAX_RESULT_LENGTH) : expanded;
        }
        // Known counters / control vars — strip silently
        if (lower.startsWith('count') || lower === '0') return '';
        return ''; // Strip unresolved vars
      });
    };

    return expand(script, 0, {});
  }

  private parseAitalk(content: string) {
    const lines = content.split(/\r?\n/);
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('#')) continue;
      // Aitalk lines often look like: \0\s[0]오늘 날씨가 좋네.\e
      if (trimmed.includes('\\') || trimmed.length > 5) {
        this.randomTalks.push(trimmed);
      }
    }
  }

  private parseDictionary(content: string) {
    // Satori parser: Looks for headers like:
    // * OnEventName
    // dialogue line 1
    // dialogue line 2
    const lines = content.split(/\r?\n/);
    let currentEvent: string | null = null;
    let currentLines: string[] = [];

    const flushEvent = () => {
      if (currentEvent && currentLines.length > 0) {
        if (!this.events[currentEvent]) {
          this.events[currentEvent] = [];
        }
        this.events[currentEvent].push(...currentLines);
      }
      currentLines = [];
      currentEvent = null;
    };

    for (let line of lines) {
      // Clean comment
      const commentIdx = line.indexOf('//');
      if (commentIdx !== -1) line = line.slice(0, commentIdx);
      const hashIdx = line.indexOf('#');
      if (hashIdx !== -1) line = line.slice(0, hashIdx);

      const trimmed = line.trim();
      if (!trimmed) continue;

      // Satori headers: * OnEventName
      if (trimmed.startsWith('*') || trimmed.startsWith('＠')) {
        flushEvent();
        const header = trimmed.slice(1).trim();
        // Remove spaces inside header name
        currentEvent = header.replace(/\s+/g, '');
      } else if (currentEvent) {
        // Collect dialogue line
        if (trimmed.includes('\\') || trimmed.length > 2) {
          currentLines.push(trimmed);
        }
      }
    }
    flushEvent();

    // YAYA/DIC parser: Extract functions and double-quoted strings robustly
    const funcStartRegex = /(?:^|[\r\n\s;])([A-Za-z0-9_.-]+)(?:\s*:\s*[A-Za-z0-9_.-]+)?\s*\{/g;
    
    let match;
    while ((match = funcStartRegex.exec(content)) !== null) {
      const eventName = match[1];
      const startIndex = match.index + match[0].length;
      
      let depth = 1;
      let endIndex = -1;
      let inString = false;
      let escape = false;
      
      for (let i = startIndex; i < content.length; i++) {
        const char = content[i];
        if (escape) { escape = false; continue; }
        if (char === '\\') { escape = true; continue; }
        if (char === '"') { inString = !inString; continue; }
        if (!inString) {
          if (char === '{') depth++;
          else if (char === '}') {
            depth--;
            if (depth === 0) {
              endIndex = i;
              break;
            }
          }
        }
      }
      
      if (endIndex === -1) continue;
      
      const body = content.substring(startIndex, endIndex);
      
      const blocks: string[] = [];
      let searchIdx = 0;
      while (searchIdx < body.length) {
        const openBrace = body.indexOf('{', searchIdx);
        if (openBrace === -1) break;
        
        let d = 1;
        let closeBrace = -1;
        let isStr = false;
        let esc = false;
        for (let i = openBrace + 1; i < body.length; i++) {
          const c = body[i];
          if (esc) { esc = false; continue; }
          if (c === '\\') { esc = true; continue; }
          if (c === '"') { isStr = !isStr; continue; }
          if (!isStr) {
            if (c === '{') d++;
            else if (c === '}') {
              d--;
              if (d === 0) {
                closeBrace = i;
                break;
              }
            }
          }
        }
        
        if (closeBrace !== -1) {
          blocks.push(body.substring(openBrace + 1, closeBrace));
          searchIdx = closeBrace + 1;
        } else {
          searchIdx = openBrace + 1;
        }
      }
      
      if (blocks.length === 0) {
        blocks.push(body);
      }
      
      const foundScripts: string[] = [];
      const isVariableAssignment = (matchIdx: number, block: string): boolean => {
        let idx = matchIdx - 1;
        while (idx >= 0 && /\s/.test(block[idx])) {
          idx--;
        }
        return idx >= 0 && block[idx] === '=';
      };

      for (const block of blocks) {
        // Process line by line: each line is an independent dialogue alternative in AYA/YAYA.
        // The -- operator only concatenates groups WITHIN a single line.
        // Splitting the whole block by -- crosses line boundaries and creates wrong combinations.
        const blines = block.split(/\r?\n/);
        for (const bline of blines) {
          const trimmedLine = bline.trim();
          if (!trimmedLine) continue;

          if (trimmedLine.includes('--')) {
            // Within this line, -- separates groups to concatenate (pick one from each group).
            const parts = trimmedLine.split('--');
            const groups: string[][] = [];

            for (const part of parts) {
              const stringRegex = /"([^"\\]*(?:\\.[^"\\]*)*)"/g;
              let strMatch;
              const partStrings: string[] = [];
              while ((strMatch = stringRegex.exec(part)) !== null) {
                if (isVariableAssignment(strMatch.index, part)) continue;
                let cleanStr = strMatch[1];
                cleanStr = cleanStr.replace(/\\\\/g, '\\').replace(/\\"/g, '"');
                partStrings.push(cleanStr);
              }
              if (partStrings.length > 0) groups.push(partStrings);
            }

            if (groups.length > 0) {
              // Kawari vs YAYA semantics for --:
              // - If ALL groups have exactly 1 string each → Kawari style: pick ONE alternative from the whole line
              // - If ANY group has 2+ strings → YAYA style: cartesian product (pick one from each group, concatenate)
              const allSingle = groups.every(g => g.length === 1);
              if (allSingle) {
                // Kawari-style: each -- separated string is its own independent alternative
                for (const group of groups) {
                  const s = group[0];
                  if (s.includes('\\') || s.length > 5) foundScripts.push(s);
                }
              } else {
                // YAYA-style: cartesian product
                const combos: string[] = [];
                const generate = (gIdx: number, currentStr: string) => {
                  if (gIdx === groups.length) { combos.push(currentStr); return; }
                  for (const s of groups[gIdx]) generate(gIdx + 1, currentStr + s);
                };
                generate(0, '');
                for (const combo of combos) {
                  if (combo.includes('\\') || combo.length > 5) foundScripts.push(combo);
                }
              }
            }
          } else {
            // No -- on this line: each quoted string is its own independent alternative.
            const stringRegex = /"([^"\\]*(?:\\.[^"\\]*)*)"/g;
            let strMatch;
            while ((strMatch = stringRegex.exec(trimmedLine)) !== null) {
              if (isVariableAssignment(strMatch.index, trimmedLine)) continue;
              let cleanStr = strMatch[1];
              cleanStr = cleanStr.replace(/\\\\/g, '\\').replace(/\\"/g, '"');
              if (cleanStr.includes('\\') || cleanStr.length > 5) foundScripts.push(cleanStr);
            }
          }
        }
      }
      
      if (foundScripts.length > 0) {
        const key = eventName; 
        if (!this.events[key]) {
          this.events[key] = [];
        }
        this.events[key].push(...foundScripts);
      }
      
      funcStartRegex.lastIndex = endIndex + 1;
    }
  }

  private addFallbacks() {
    const addIfMissing = (event: string, scripts: string[]) => {
      if (!this.events[event] || this.events[event].length === 0) {
        this.events[event] = scripts;
      }
    };

    if (this.isJapaneseGhost()) {
      addIfMissing('OnBoot', [
        `\\0\\s[0]こんにちは！また会えたね。\\e`,
        `\\0\\s[0]今日もいい天気だね！\\e`,
      ]);

      addIfMissing('OnFirstBoot', [
        `\\0\\s[0]はじめまして、これからよろしくね！\\e`,
      ]);

      addIfMissing('OnClose', [
        `\\0\\s[0]バイバイ、またね！\\e`,
      ]);

      addIfMissing('OnMouseDoubleClick', [
        `\\0\\s[0]きゃっ！どうしたの？\\e`,
        `\\0\\s[0]なにか用？\\e`,
      ]);

      addIfMissing('OnMouseMove', [
        `\\0\\s[0]なでなでされるの、気持ちいいな。\\e`,
        `\\0\\s[0]くすぐったいよ！\\e`,
      ]);

      addIfMissing('OnUserInput', [
        `\\0\\s[0]「(Reference0)」って言われても、よく分からないな。\\e`,
        `\\0\\s[0]「(Reference0)」について、一緒にお話しする？\\e`,
      ]);
    } else {
      addIfMissing('OnBoot', [
        `\\0\\s[0]반가워! 다시 만나게 되었네.\\e`,
        `\\0\\s[0]오늘도 기분 좋은 하루야!\\e`,
      ]);

      addIfMissing('OnFirstBoot', [
        `\\0\\s[0]안녕? 처음 만나는구나. 잘 부탁해!\\e`,
      ]);

      addIfMissing('OnClose', [
        `\\0\\s[0]잘 가, 다음에 또 봐!\\e`,
      ]);

      addIfMissing('OnMouseDoubleClick', [
        `\\0\\s[0]앗! 왜 때리는 거야?\\e`,
        `\\0\\s[0]무슨 일이야?\\e`,
      ]);

      addIfMissing('OnMouseMove', [
        `\\0\\s[0]헤헤... 쓰다듬어 주니까 기분 좋다.\\e`,
        `\\0\\s[0]간지러워!\\e`,
      ]);

      addIfMissing('OnUserInput', [
        `\\0\\s[0]"(Reference0)"라고? 무슨 뜻인지 모르겠어.\\e`,
        `\\0\\s[0]"(Reference0)"에 대해서 나랑 이야기해 볼래?\\e`,
        `\\0\\s[0]그렇구나... "(Reference0)"인 거네.\\e`,
      ]);
    }
  }

  private getMisakaMatchedScripts(key: string, refParts: string[]): string[] {
    const lowerKey = key.toLowerCase();
    const candidates = this.misakaEvents[lowerKey];
    if (!candidates || candidates.length === 0) return [];

    const matched: string[] = [];
    for (const item of candidates) {
      if (item.conditionStr) {
        if (this.evaluateMisakaCondition(item.conditionStr, refParts, key)) {
          matched.push(item.script);
        }
        continue;
      }

      if (!item.condition) {
        matched.push(item.script);
        continue;
      }

      const { refIndex, refValue, isNot } = item.condition;
      let actualValue = '';
      const isMouseEvent = lowerKey.startsWith('onmouse') || lowerKey === 'onmousemove';

      if (isMouseEvent && refParts.length === 4) {
        if (refIndex === 3) actualValue = refParts[2]; // scope
        else if (refIndex === 4) actualValue = refParts[3]; // label
        else actualValue = refParts[refIndex] || '';
      } else {
        actualValue = refParts[refIndex] || '';
      }

      const isMatch = actualValue.toLowerCase() === refValue.toLowerCase();
      if (isNot ? !isMatch : isMatch) {
        matched.push(item.script);
      }
    }
    return matched;
  }

  private getEventScripts(key: string, refParts: string[] = []): string[] {
    const searchKeys = [
      key.toLowerCase(),
      `event.${key.toLowerCase()}`
    ];
    for (const searchKey of searchKeys) {
      const misakaScripts = this.getMisakaMatchedScripts(searchKey, refParts);
      if (misakaScripts.length > 0) {
        return misakaScripts;
      }
    }

    const exact = this.events[key];
    if (exact && exact.length > 0) return exact;
    
    const lowerKey = key.toLowerCase();
    const lowerMatch = this.events[lowerKey];
    if (lowerMatch && lowerMatch.length > 0) return lowerMatch;
    
    const withEventPrefix = `event.${lowerKey}`;
    const prefixMatch = this.events[withEventPrefix];
    if (prefixMatch && prefixMatch.length > 0) return prefixMatch;

    for (const k of Object.keys(this.events)) {
      const lowerK = k.toLowerCase();
      if (lowerK === lowerKey || lowerK === withEventPrefix) {
        return this.events[k];
      }
    }
    return [];
  }

  /**
   * Dispatches an event to the virtual SHIORI engine and returns a SakuraScript string.
   */
  public trigger(event: string, refParts: string[] = []): string {
    console.log(`[ShioriRunner] Trigger event: ${event}`, refParts);

    let scriptList: string[] = [];

    if (event === 'OnSecondChange') {
      scriptList = this.getEventScripts('OnSecondChange', refParts);
    } else if (event === 'OnRandomTalk') {
      scriptList = this.randomTalks;
    } else if (event === 'OnBoot') {
      // Boot category time-based check
      const hour = new Date().getHours();
      const categories: string[] = [];
      if (hour >= 0 && hour < 5) {
        categories.push('midnight');
      } else if (hour >= 5 && hour < 9) {
        categories.push('earlymornig', 'earlymorning', 'morning');
      } else if (hour >= 9 && hour < 17) {
        categories.push('day');
      } else if (hour >= 17 && hour < 19) {
        categories.push('evening');
      } else {
        categories.push('night');
      }

      for (const cat of categories) {
        let scripts = this.getEventScripts(`another.talkbootup${cat}`, refParts);
        if (scripts.length > 0) {
          scriptList = scripts;
          break;
        }
        scripts = this.getEventScripts(`talkbootup${cat}`, refParts);
        if (scripts.length > 0) {
          scriptList = scripts;
          break;
        }
        scripts = this.getEventScripts(`ntalkbootup${cat}`, refParts);
        if (scripts.length > 0) {
          scriptList = scripts;
          break;
        }
        scripts = this.getEventScripts(`n.talkbootup${cat}`, refParts);
        if (scripts.length > 0) {
          scriptList = scripts;
          break;
        }
      }

      if (scriptList.length === 0) {
        scriptList = this.getEventScripts('talkbootup', refParts);
      }
      if (scriptList.length === 0) {
        scriptList = this.getEventScripts('ntalkbootup', refParts);
      }
      if (scriptList.length === 0) {
        scriptList = this.getEventScripts('another.talkbootup', refParts);
      }
      if (scriptList.length === 0) {
        scriptList = this.getEventScripts('talkfirstboot', refParts);
      }
      if (scriptList.length === 0) {
        scriptList = this.getEventScripts('OnBoot', refParts);
      }
    } else if (event === 'OnClose') {
      // Close category time-based check
      const hour = new Date().getHours();
      const categories: string[] = [];
      if (hour >= 0 && hour < 5) {
        categories.push('midnight');
      } else if (hour >= 5 && hour < 9) {
        categories.push('earlymorning', 'morning');
      } else if (hour >= 9 && hour < 17) {
        categories.push('day');
      } else if (hour >= 17 && hour < 19) {
        categories.push('evening');
      } else {
        categories.push('night');
      }

      for (const cat of categories) {
        let scripts = this.getEventScripts(`another.talkclose${cat}`, refParts);
        if (scripts.length > 0) {
          scriptList = scripts;
          break;
        }
        scripts = this.getEventScripts(`talkclose${cat}`, refParts);
        if (scripts.length > 0) {
          scriptList = scripts;
          break;
        }
        scripts = this.getEventScripts(`ntalkclose${cat}`, refParts);
        if (scripts.length > 0) {
          scriptList = scripts;
          break;
        }
        scripts = this.getEventScripts(`n.talkclose${cat}`, refParts);
        if (scripts.length > 0) {
          scriptList = scripts;
          break;
        }
      }

      if (scriptList.length === 0) {
        scriptList = this.getEventScripts('talkclose', refParts);
      }
      if (scriptList.length === 0) {
        scriptList = this.getEventScripts('ntalkclose', refParts);
      }
      if (scriptList.length === 0) {
        scriptList = this.getEventScripts('another.talkclose', refParts);
      }
      if (scriptList.length === 0) {
        scriptList = this.getEventScripts('OnClose', refParts);
      }
    } else if (event === 'OnFirstBoot') {
      scriptList = this.getEventScripts('talkfirstboot', refParts);
      if (scriptList.length === 0) {
        scriptList = this.getEventScripts('another.talkfirstboot', refParts);
      }
      if (scriptList.length === 0) {
        scriptList = this.getEventScripts('OnFirstBoot', refParts);
      }
    } else if (event === 'OnUserInput') {
      const userInput = (refParts[0] || '').trim();
      const lowerInput = userInput.toLowerCase();
      let matchedScripts: string[] = [];

      if (lowerInput) {
        // 1. Direct 1:1 match with user word
        matchedScripts = this.getEventScripts(lowerInput, refParts);

        // 2. Keyword check: If no direct match, check if any of the dictionary keys (>=2 chars)
        // are contained within the user's sentence.
        if (matchedScripts.length === 0) {
          const dictKeys = Object.keys(this.rawKawari).concat(Object.keys(this.events));
          for (const key of dictKeys) {
            const lowerKey = key.toLowerCase();
            // Ignore system events and very short words
            if (lowerKey.length >= 2 && !lowerKey.includes('on') && !lowerKey.includes('talk') && !lowerKey.includes('.')) {
              if (lowerInput.includes(lowerKey)) {
                console.log(`[ShioriRunner] Keyword matched: "${key}" from user input "${userInput}"`);
                const scripts = this.getEventScripts(lowerKey, refParts);
                if (scripts.length > 0) {
                  matchedScripts = scripts;
                  break;
                }
              }
            }
          }
        }
      }

      if (matchedScripts.length > 0) {
        scriptList = matchedScripts;
      } else {
        const customScripts = this.getEventScripts('OnUserInput', refParts);
        const isFallback = customScripts.length > 0 && customScripts[0].includes('"(Reference0)"라고?');
        if (this.randomTalks.length > 0 && (customScripts.length === 0 || isFallback)) {
          scriptList = this.randomTalks;
        } else {
          scriptList = customScripts;
        }
      }
    } else {
      scriptList = this.getEventScripts(event, refParts);
    }

    // Specific coordinate-based double click overrides
    if (event === 'OnMouseDoubleClick' && refParts.length >= 4) {
      // refParts: [x, y, characterScope, collisionLabel]
      const scope = refParts[2];
      const label = refParts[3];
      const labelLower = label.toLowerCase();
      const scopeNum = parseInt(scope, 10);
      
      const searchKeys = [
        `another.character${scope}doubleclick.${labelLower}`,
        `character${scope}doubleclick.${labelLower}`,
        `another.character${scope}doubleclick`,
        `character${scope}doubleclick`,
        `onmousedoubleclick${label}`,
      ];

      // Add Kawari-style click handlers
      if (scopeNum === 0) {
        if (labelLower) {
          searchKeys.push(`talksakura${labelLower}click`);
        }
        searchKeys.push(`talksakuraclick`);
      } else if (scopeNum === 1) {
        if (labelLower) {
          searchKeys.push(`talkkero${labelLower}click`);
        }
        searchKeys.push(`talkkeroclick`);
      }

      for (const key of searchKeys) {
        const scripts = this.getEventScripts(key, refParts);
        if (scripts.length > 0) {
          scriptList = scripts;
          break;
        }
      }
    }

    // Specific coordinate-based single click overrides
    if (event === 'OnMouseClick' && refParts.length >= 4) {
      const scope = refParts[2];
      const label = refParts[3];
      const labelLower = label.toLowerCase();
      const scopeNum = parseInt(scope, 10);
      
      const searchKeys = [
        `another.character${scope}singleclick.${labelLower}`,
        `character${scope}singleclick.${labelLower}`,
        `another.character${scope}singleclick`,
        `character${scope}singleclick`,
        `anohter.character${scope}singleclick.${labelLower}`, // handle potential legacy typos in scripts
        `onmouseclick${label}`,
      ];

      // Add Kawari-style click handlers
      if (scopeNum === 0) {
        if (labelLower) {
          searchKeys.push(`talksakura${labelLower}click`);
        }
        searchKeys.push(`talksakuraclick`);
      } else if (scopeNum === 1) {
        if (labelLower) {
          searchKeys.push(`talkkero${labelLower}click`);
        }
        searchKeys.push(`talkkeroclick`);
      }

      for (const key of searchKeys) {
        const scripts = this.getEventScripts(key, refParts);
        if (scripts.length > 0) {
          scriptList = scripts;
          break;
        }
      }
    }

    // Specific mouse rub/stroke overrides
    if (event === 'OnMouseMove' && refParts.length >= 4) {
      const scope = refParts[2];
      const label = refParts[3].toLowerCase();
      
      const coreKeys = [
        `another.character${scope}stroke.${label}`,
        `character${scope}stroke.${label}`,
        `another.character${scope}stroke`,
        `character${scope}stroke`,
        `onmousemove${refParts[3]}`,
      ];

      let targetKey = '';
      for (const key of coreKeys) {
        const scripts = this.getEventScripts(key, refParts);
        if (scripts.length > 0) {
          targetKey = key;
          scriptList = scripts;
          break;
        }
      }

      if (targetKey) {
        const limitKeys = [
          `another.limit.character${scope}stroke.${label}`,
          `limit.character${scope}stroke.${label}`,
          `another.limit.character${scope}stroke`,
          `limit.character${scope}stroke`,
        ];

        let limit = 40; // Default stroke limit
        for (const limitKey of limitKeys) {
          const limitScripts = this.getEventScripts(limitKey, refParts);
          if (limitScripts.length > 0) {
            const parsedLimit = parseInt(limitScripts[0], 10);
            if (!isNaN(parsedLimit)) {
              limit = parsedLimit;
              break;
            }
          }
        }

        const countKey = `${scope}.${label}`;
        this.strokeCounts[countKey] = (this.strokeCounts[countKey] || 0) + 1;

        const halfLimit = Math.floor(limit / 2);
        if (this.strokeCounts[countKey] === halfLimit && halfLimit > 0) {
          const halfScripts = this.getEventScripts(`${targetKey}.half`, refParts);
          if (halfScripts.length > 0) {
            scriptList = halfScripts;
          } else {
            return '';
          }
        } else if (this.strokeCounts[countKey] >= limit) {
          this.strokeCounts[countKey] = 0;
          // scriptList is already targetKey scripts
        } else {
          return '';
        }
      } else {
        return '';
      }
    }

    if (event === 'OnChoiceSelect' && refParts.length > 0) {
      const choiceId = refParts[0];
      const scripts = this.getEventScripts(choiceId, refParts);
      if (scripts.length > 0) {
        scriptList = scripts;
      } else {
        return this.isJapaneseGhost()
          ? `\\0\\s[0]選択肢 ${choiceId} を選んだよ。\\e`
          : `\\0\\s[0]선택지 ${choiceId}를 눌렀어.\\e`;
      }
    }

    if (scriptList.length === 0) {
      // Prevent mouse and second events from falling back to OnBoot
      if (
        event === 'OnSecondChange' ||
        event === 'OnMouseMove' ||
        event === 'OnMouseClick' ||
        event === 'OnMouseDoubleClick'
      ) {
        return '';
      }
      scriptList = this.getEventScripts(event, refParts);
      if (scriptList.length === 0) {
        scriptList = this.getEventScripts('OnBoot', refParts);
      }
    }

    // Pick a random script
    const randomIndex = Math.floor(Math.random() * scriptList.length);
    let script = scriptList[randomIndex] || '';

    // If double-clicking character prompts a menu ($DoubleClickMenu), redirect to a random talk instead.
    if (event === 'OnMouseDoubleClick' && script.toLowerCase().includes('doubleclickmenu')) {
      console.log('[ShioriRunner] DoubleClickMenu detected, redirecting to OnRandomTalk');
      const randomTalkList = this.randomTalks.length > 0 ? this.randomTalks : this.getEventScripts('OnRandomTalk', refParts);
      if (randomTalkList.length > 0) {
        const rIdx = Math.floor(Math.random() * randomTalkList.length);
        script = randomTalkList[rIdx] || '';
      } else {
        // Default fallback if no talks are registered
        script = this.isJapaneseGhost() ? '\\0\\s[0]なにか用？\\e' : '\\0\\s[0]무슨 일 있어?\\e';
      }
    }

    // Expand Kawari variables dynamically
    script = this.expandSingleKawariScript(script, refParts);

    // Safety guard: if script is abnormally long it indicates a bad expansion — discard it
    if (script.length > 2000) {
      console.warn(`[ShioriRunner] Script for event "${event}" exceeds max length (${script.length} chars), discarding.`);
      return '';
    }

    // Apply template replacements
    script = this.replaceVariables(script, refParts);

    // If script has no renderable dialogue text (only SakuraScript tags, whitespace, or is empty),
    // discard it to prevent empty dialogue bubbles.
    const renderableText = script
      .replace(/\\[a-zA-Z_][^\\]*/g, '') // strip \tag sequences
      .replace(/\s+/g, '')
      .trim();
    if (!renderableText) {
      return '';
    }

    return script;
  }

  private replaceVariables(script: string, refParts: string[] = []): string {
    let result = script;
    
    // Replace references: (Reference0) or (ref0) or (Reference1)... or {$reference(0)}
    refParts.forEach((part, idx) => {
      const refRegex = new RegExp(`\\(Reference${idx}\\)`, 'gi');
      result = result.replace(refRegex, part);
      const refRegexShort = new RegExp(`\\(ref${idx}\\)`, 'gi');
      result = result.replace(refRegexShort, part);
      const refRegexMisaka = new RegExp(`\\{\\$reference\\(${idx}\\)\\}`, 'gi');
      result = result.replace(refRegexMisaka, part);
    });

    // Also support general {$reference(N)} replacement for out of range indices
    result = result.replace(/\{\$reference\((\d+)\)\}/gi, (_match, p1) => {
      const idx = parseInt(p1, 10);
      return refParts[idx] || '';
    });
    
    // Replace Satori / Ukagaka placeholders
    result = result.replace(/\(username\)/gi, this.userName);
    result = result.replace(/\(user\)/gi, this.userName);
    result = result.replace(/\(owner\)/gi, this.userName);
    result = result.replace(/\(주인\)/g, this.userName);
    result = result.replace(/\(사용자\)/g, this.userName);
    result = result.replace(/%username/gi, this.userName);
    result = result.replace(/\{\$username\}/gi, this.userName);
    result = result.replace(/\{\$user\}/gi, this.userName);

    // Replace character names
    result = result.replace(/\(sakuraname\)/gi, this.metadata.sakuraName);
    result = result.replace(/\(keroname\)/gi, this.metadata.keroName);
    result = result.replace(/%sakuraname/gi, this.metadata.sakuraName);
    result = result.replace(/%keroname/gi, this.metadata.keroName);
    result = result.replace(/%selfname/gi, this.metadata.sakuraName);
    result = result.replace(/\{\$sakuraname\}/gi, this.metadata.sakuraName);
    result = result.replace(/\{\$keroname\}/gi, this.metadata.keroName);
    result = result.replace(/\{\$selfname\}/gi, this.metadata.sakuraName);

    // System variables
    const now = new Date();
    result = result.replace(/(%year|\{\$year\})/gi, String(now.getFullYear()));
    result = result.replace(/(%month|\{\$month\})/gi, String(now.getMonth() + 1));
    result = result.replace(/(%day|\{\$day\})/gi, String(now.getDate()));
    result = result.replace(/(%hour|\{\$hour\})/gi, String(now.getHours()));
    result = result.replace(/(%minute|\{\$minute\})/gi, String(now.getMinutes()));
    result = result.replace(/(%second|\{\$second\})/gi, String(now.getSeconds()));

    const screenWidth = typeof window !== 'undefined' ? window.screen.width : 1920;
    const screenHeight = typeof window !== 'undefined' ? window.screen.height : 1080;
    result = result.replace(/%screenwidth/gi, String(screenWidth));
    result = result.replace(/%screenheight/gi, String(screenHeight));

    // Replace Kawari-style ${variable} placeholders
    if (this.isJapaneseGhost()) {
      result = result.replace(/\$\{n-gs\}/gi, 'あいつ');
      result = result.replace(/\$\{unyu1\}/gi, 'うにゅー');
      result = result.replace(/\$\{unyu\}/gi, 'うにゅ');
    } else {
      result = result.replace(/\$\{n-gs\}/gi, '그 녀석');
      result = result.replace(/\$\{unyu1\}/gi, '우뉴-');
      result = result.replace(/\$\{unyu\}/gi, '우뉴');
    }
    result = result.replace(/\$\{0\}/gi, '');

    // Strip Misaka control blocks using brace balancer (handles nested braces correctly)
    result = this.stripMisakaControlBlocks(result);

    // Strip control directives
    result = result.replace(/;\s*nonoverlap\s*;?/gi, '');
    result = result.replace(/;\s*AIOVERRIDE\s*;?/gi, '');

    // Strip \\q and \\_q choice / menu blocks (not implemented, remove entirely)
    // \\q[text,id] choice items and \\_q ... \\q mode delimiters
    result = result.replace(/\\_q/gi, '');
    result = result.replace(/\\q\[[^\]]*\]/gi, '');
    result = result.replace(/\\q/gi, '');

    // Strip any remaining unresolved Kawari / Misaka vars (Unicode-aware, no assignment)
    result = result.replace(/\$\{[^{}\s]+\}/g, '');
    result = result.replace(/\{\$[^{}\s]+\}/g, '');

    // 1. Evaluate choice inline function: {$choice(A,B,...)} or $(choice,A,B,...)
    const evaluateChoices = (text: string): string => {
      // Misaka style {$choice(A,B,...)}
      let temp = text.replace(/\{\$choice\(([^)]+)\)\}/gi, (_match, p1) => {
        const choices = p1.split(/(?<!\\),/).map((c: string) => c.replace(/\\,/g, ',').trim());
        return choices.length > 0 ? choices[Math.floor(Math.random() * choices.length)] : '';
      });
      // Kawari style $(choice,A,B,...)
      temp = temp.replace(/\$\(choice\s*,?\s*([^)]+)\)/gi, (_match, p1) => {
        const choices = p1.split(/(?<!\\),/).map((c: string) => c.replace(/\\,/g, ',').trim());
        return choices.length > 0 ? choices[Math.floor(Math.random() * choices.length)] : '';
      });
      return temp;
    };
    result = evaluateChoices(result);

    // 2. Resolve Korean postposition templates like [이;가], [은;는], [을;를], [과;와], [아;야], [이;]
    const resolveKoreanPostpositions = (text: string): string => {
      const hasBatchim = (char: string): boolean => {
        if (!char) return false;
        const code = char.charCodeAt(0) - 0xac00;
        if (code < 0 || code > 11172) return false; // Not a Hangul syllable
        return code % 28 !== 0; // If remainder is not 0, it has a final consonant (batchim)
      };

      return text.replace(/\[([^;\]]+);([^\]]*)\]/g, (_match, pos1, pos2, offset) => {
        const beforeText = text.slice(0, offset);
        // Remove SakuraScript tags and non-Hangul chars to find the nearest preceding Hangul syllable
        const cleanBefore = beforeText
          .replace(/\\[a-zA-Z0-9_!*?&~\-+^#@=[\]{}()]+/g, '')
          .replace(/[^가-힣]/g, '');
        
        const lastChar = cleanBefore.slice(-1);
        if (!lastChar) {
          return pos2 || '';
        }
        return hasBatchim(lastChar) ? pos1 : (pos2 || '');
      });
    };
    result = resolveKoreanPostpositions(result);

    return result;
  }

  /**
   * Removes Misaka SHIORI control blocks (assignments and counter ops) from a script string.
   * Uses a brace balancer so nested braces like {$flag={$if(...)}} are fully removed.
   * Leaves read-only variable references like {$username} for the caller to substitute.
   */
  private stripMisakaControlBlocks(script: string): string {
    let result = '';
    let i = 0;
    const len = script.length;

    while (i < len) {
      // Look for {$ — possible start of a Misaka variable block
      if (script[i] === '{' && i + 1 < len && script[i + 1] === '$') {
        // Find matching closing brace with brace counter
        let braceCount = 1;
        let j = i + 1;
        while (j < len && braceCount > 0) {
          if (script[j] === '{') braceCount++;
          else if (script[j] === '}') braceCount--;
          j++;
        }
        const block = script.slice(i, j); // full {$...} block
        // Extract inner content after {$
        const inner = block.slice(2, -1); // strip leading '{$' and trailing '}'
        // It's a control statement if the variable name is followed by an assignment or increment
        const isControl = /^[A-Za-z0-9_.\-]+\s*[+\-]?=/.test(inner) ||
                          /^[A-Za-z0-9_.\-]+\s*[+\-][+\-]/.test(inner) ||
                          /^[A-Za-z0-9_.\-]+\s*[+\-]=/.test(inner);
        if (isControl) {
          i = j; // skip the entire block
        } else {
          result += script[i];
          i++;
        }
      } else {
        result += script[i];
        i++;
      }
    }
    return result;
  }

  public getMetadata(): GhostMetadata {
    return this.metadata;
  }

  private parseKawari(content: string) {
    const normalized = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    const lines = normalized.split('\n');
    for (let line of lines) {
      const trimmedLine = line.trim();
      if (!trimmedLine || trimmedLine.startsWith('#') || trimmedLine.startsWith('//')) {
        continue;
      }

      const colonIdx = line.indexOf(':');
      if (colonIdx === -1) continue;

      const key = line.slice(0, colonIdx).trim().toLowerCase();
      const val = line.slice(colonIdx + 1).trim();

      if (!val) continue;

      let cleanVal = val;
      const commentIdx = val.indexOf('#');
      if (commentIdx !== -1) cleanVal = val.slice(0, commentIdx).trim();
      const slashCommentIdx = cleanVal.indexOf('//');
      if (slashCommentIdx !== -1) cleanVal = cleanVal.slice(0, slashCommentIdx).trim();

      if (!cleanVal) continue;

      // Split by comma for alternatives (ignoring escaped commas \,)
      const parts = cleanVal.split(/(?<!\\),/).map(p => p.replace(/\\,/g, ',').trim()).filter(Boolean);
      if (parts.length === 0) continue;

      if (!this.rawKawari[key]) {
        this.rawKawari[key] = [];
      }
      this.rawKawari[key].push(...parts);

      // Skip lines that are pure Kawari code expressions (function calls, etc.)
      if (cleanVal.includes('$(')) {
        continue;
      }

      // Process each alternative as a separate script choice
      for (const part of parts) {
        let scriptVal = part;
        // Strip leading control var patterns like ${countzero} that produce nothing
        scriptVal = scriptVal.replace(/^\$\{[^{}\s]+\}/g, '').trim();
        if (!scriptVal) continue;

        if (!this.events[key]) {
          this.events[key] = [];
        }
        this.events[key].push(scriptVal);

        // Only parse random talk sentences (keys starting with sentence)
        if (key.startsWith('sentence')) {
          this.randomTalks.push(scriptVal);
        }
      }
    }
  }

  private parseMisaka(content: string) {
    const normalized = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    let i = 0;
    const len = normalized.length;

    while (i < len) {
      // Skip comments
      if (normalized.startsWith('//', i)) {
        const nextNewline = normalized.indexOf('\n', i);
        i = nextNewline !== -1 ? nextNewline + 1 : len;
        continue;
      }
      if (normalized.startsWith('#', i)) {
        const nextNewline = normalized.indexOf('\n', i);
        i = nextNewline !== -1 ? nextNewline + 1 : len;
        continue;
      }

      // Check if we are starting a declaration:
      // Starts with '$', followed by any non-whitespace/non-brace char, and not preceded by '{'
      if (normalized[i] === '$' && normalized[i + 1] && /[^\s{},;()\/]/.test(normalized[i + 1]) && (i === 0 || normalized[i - 1] !== '{')) {
        i++; // skip '$'
        // Read key name — allow any non-whitespace, non-special chars (including Korean)
        let key = '';
        while (i < len && /[^\s{},;()=+\-<>!&|\[\]\\:'"]/.test(normalized[i])) {
          key += normalized[i];
          i++;
        }
        if (!key) continue;

        // Read declaration line until newline
        let declarationLine = '';
        while (i < len && normalized[i] !== '\n') {
          declarationLine += normalized[i];
          i++;
        }

        // Now, read the body lines until the next declaration starts or end of file
        const bodyLines: string[] = [];
        let currentLine = '';
        
        while (i < len) {
          // Check if a new declaration starts (supports Unicode/Korean keys)
          if (normalized[i] === '$' && normalized[i + 1] && /[^\s{},;()\/]/.test(normalized[i + 1]) && normalized[i - 1] !== '{') {
            break;
          }

          // Skip comments in the body
          if (normalized.startsWith('//', i)) {
            const nextNewline = normalized.indexOf('\n', i);
            i = nextNewline !== -1 ? nextNewline + 1 : len;
            continue;
          }
          if (normalized.startsWith('#', i)) {
            const nextNewline = normalized.indexOf('\n', i);
            i = nextNewline !== -1 ? nextNewline + 1 : len;
            continue;
          }

          const char = normalized[i];
          if (char === '\n') {
            const trimmed = currentLine.trim();
            if (trimmed) {
              bodyLines.push(trimmed);
            }
            currentLine = '';
            i++;
          } else {
            currentLine += char;
            i++;
          }
        }
        if (currentLine.trim()) {
          bodyLines.push(currentLine.trim());
        }

        // Extract condition from declarationLine using a brace balancer
        let condition: string | undefined;
        const ifIdx = declarationLine.toLowerCase().indexOf('{$if');
        if (ifIdx !== -1) {
          let braceCount = 1;
          let idx = ifIdx + 1; // skip first '{' of '{$if'
          const declLen = declarationLine.length;
          let conditionContent = '';
          while (idx < declLen && braceCount > 0) {
            const char = declarationLine[idx];
            if (char === '{') {
              braceCount++;
            } else if (char === '}') {
              braceCount--;
              if (braceCount === 0) break;
            }
            conditionContent += char;
            idx++;
          }
          if (braceCount === 0) {
            const trimCondition = conditionContent.replace(/^\$?if\s*/i, '').trim();
            if (trimCondition.startsWith('(') && trimCondition.endsWith(')')) {
              condition = trimCondition.slice(1, -1).trim();
            } else {
              condition = trimCondition;
            }
          }
        }

        const bodyText = bodyLines.join('\n').trim();
        if (bodyText.startsWith('{') && !bodyText.startsWith('{$')) {
          // Parse brace-enclosed blocks
          let idx = 0;
          const bodyLen = bodyText.length;
          while (idx < bodyLen) {
            while (idx < bodyLen && bodyText[idx] !== '{') {
              idx++;
            }
            if (idx >= bodyLen) break;
            idx++; // skip '{'

            let braceCount = 1;
            let blockContent = '';
            let inString = false;
            let escape = false;

            while (idx < bodyLen && braceCount > 0) {
              const char = bodyText[idx];
              if (escape) {
                blockContent += char;
                escape = false;
                idx++;
                continue;
              }
              if (char === '\\') {
                blockContent += char;
                escape = true;
                idx++;
                continue;
              }
              if (char === '"') {
                inString = !inString;
              }
              if (!inString) {
                if (char === '{') braceCount++;
                else if (char === '}') {
                  braceCount--;
                  if (braceCount === 0) {
                    idx++; // skip closing '}'
                    break;
                  }
                }
              }
              blockContent += char;
              idx++;
            }

            if (blockContent.trim()) {
              this.addMisakaScript(key, blockContent.trim(), condition);
            }
          }
        } else {
          // Plain list
          for (const line of bodyLines) {
            const trimmed = line.trim();
            if (trimmed) {
              this.addMisakaScript(key, trimmed, condition);
            }
          }
        }
      } else {
        i++;
      }
    }
  }

  private addMisakaScript(key: string, script: string, conditionStr?: string) {
    const normalizedKey = key.toLowerCase();
    let condition: { refIndex: number; refValue: string; isNot?: boolean } | undefined;

    if (conditionStr) {
      // Parse simple e.g. {$reference(0)}==card or {$reference(0)}=="talkwithf" for compatibility
      const refMatch = conditionStr.match(/\{\$reference\((\d+)\)\}\s*(==|!=)\s*(.*)/i);
      if (refMatch) {
        const refIndex = parseInt(refMatch[1], 10);
        const op = refMatch[2];
        let refValue = refMatch[3].trim();

        if (refValue.startsWith('"') && refValue.endsWith('"')) {
          refValue = refValue.slice(1, -1);
        } else if (refValue.startsWith("'") && refValue.endsWith("'")) {
          refValue = refValue.slice(1, -1);
        }

        condition = {
          refIndex,
          refValue,
          isNot: op === '!=',
        };
      }
    }

    const scriptObj = { script: script.trim(), condition, conditionStr };

    if (!this.misakaEvents[normalizedKey]) {
      this.misakaEvents[normalizedKey] = [];
    }
    this.misakaEvents[normalizedKey].push(scriptObj);

    if (!conditionStr) {
      if (!this.rawKawari[normalizedKey]) {
        this.rawKawari[normalizedKey] = [];
      }
      this.rawKawari[normalizedKey].push(script.trim());
    }
  }

  private evaluateMisakaCondition(conditionStr: string, refParts: string[], key: string): boolean {
    try {
      let expr = conditionStr.trim().replace(/^\$?if\s*/i, '').trim();
      const lowerKey = key.toLowerCase();
      const isMouseEvent = lowerKey.startsWith('onmouse') || lowerKey === 'onmousemove';

      // Replace references first: {$reference(N)}
      expr = expr.replace(/\{\$reference\((\d+)\)\}/gi, (_match, p1) => {
        const idx = parseInt(p1, 10);
        let val = '';
        if (isMouseEvent && refParts.length === 4) {
          if (idx === 3) val = refParts[2]; // scope
          else if (idx === 4) val = refParts[3]; // label
          else val = refParts[idx] || '';
        } else {
          val = refParts[idx] || '';
        }
        if (/^[0-9]+$/.test(val)) {
          return val;
        }
        return JSON.stringify(val);
      });

      // System variables
      const now = new Date();
      expr = expr.replace(/\{\$hour\}/gi, String(now.getHours()));
      expr = expr.replace(/\{\$minute\}/gi, String(now.getMinutes()));
      expr = expr.replace(/\{\$second\}/gi, String(now.getSeconds()));

      // Fallback for other variables to 0/false
      expr = expr.replace(/\{\$[A-Za-z0-9_.\-]+\}/g, '0');

      // Operators normalization
      expr = expr.replace(/==/g, '===');
      expr = expr.replace(/!=/g, '!==');

      // Strict validation for syntax safety
      if (!/^[A-Za-z0-9\s()&|!=<>'\"_.\-,]+$/.test(expr)) {
        return false;
      }

      // Convert unquoted labels in comparison to string literals
      expr = expr.replace(/(===|!==|>=|<=|>|<)\s*([A-Za-z_][A-Za-z0-9_]*)/g, '$1 "$2"');
      expr = expr.replace(/([A-Za-z_][A-Za-z0-9_]*)\s*(===|!==|>=|<=|>|<)/g, '"$1" $2');

      const fn = new Function(`return !!(${expr});`);
      return fn();
    } catch (e) {
      console.warn('[ShioriRunner] Condition evaluation failed:', conditionStr, e);
      return false;
    }
  }
}
