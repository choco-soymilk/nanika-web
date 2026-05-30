export type SakuraScriptCommand =
  | { type: 'scope'; value: number } // 0 = main, 1 = partner
  | { type: 'surface'; value: number } // surface ID
  | { type: 'wait'; value: number } // in milliseconds
  | { type: 'text'; value: string } // text to type
  | { type: 'newline' } // newline character
  | { type: 'clear' } // clear current text
  | { type: 'choice'; label: string; id: string } // clickable link \q[Label,ID]
  | { type: 'end' }; // \e

export interface SakuraPlayerState {
  scope: number; // 0 or 1
  surfaces: Record<number, number>; // scope -> surfaceId
  texts: Record<number, string>; // scope -> printed text
  choices: Record<number, { label: string; id: string }[]>; // scope -> list of active choices
  isFinished: boolean;
}

export class SakuraScriptParser {
  /**
   * Tokenizes a SakuraScript string into structured commands.
   */
  public static tokenize(script: string): SakuraScriptCommand[] {
    const commands: SakuraScriptCommand[] = [];
    let i = 0;
    let textBuffer = '';

    const flushText = () => {
      if (textBuffer) {
        commands.push({ type: 'text', value: textBuffer });
        textBuffer = '';
      }
    };

    while (i < script.length) {
      if (script[i] === '\\') {
        i++; // Move past '\'
        if (i >= script.length) {
          textBuffer += '\\';
          break;
        }

        // Check double backslash (escaped backslash)
        if (script[i] === '\\') {
          textBuffer += '\\';
          i++;
          continue;
        }

        const nextChar = script[i];

        // Handle simple tags: \0, \1, \h, \u, \n, \c, \e
        if (nextChar === '0' || nextChar === 'h') {
          flushText();
          commands.push({ type: 'scope', value: 0 });
          i++;
        } else if (nextChar === '1' || nextChar === 'u') {
          flushText();
          commands.push({ type: 'scope', value: 1 });
          i++;
        } else if (nextChar === 'n') {
          flushText();
          commands.push({ type: 'newline' });
          i++;
        } else if (nextChar === 'c') {
          flushText();
          commands.push({ type: 'clear' });
          i++;
        } else if (nextChar === 'e') {
          flushText();
          commands.push({ type: 'end' });
          i++;
        }
        // Handle parameterized tags: \s[n], \w[n], \_w[n], \q[label,id]
        else if (nextChar === 's') {
          i++; // Move past 's'
          if (script[i] === '[') {
            i++; // Move past '['
            const closeBracket = script.indexOf(']', i);
            if (closeBracket !== -1) {
              const val = parseInt(script.substring(i, closeBracket), 10);
              if (!isNaN(val)) {
                flushText();
                commands.push({ type: 'surface', value: val });
              }
              i = closeBracket + 1;
            }
          } else {
            // Check for one or more digits
            let digits = '';
            while (i < script.length && /[0-9]/.test(script[i])) {
              digits += script[i];
              i++;
            }
            if (digits.length > 0) {
              const val = parseInt(digits, 10);
              flushText();
              commands.push({ type: 'surface', value: val });
            }
          }
        } else if (nextChar === 'w') {
          i++; // Move past 'w'
          if (script[i] === '[') {
            i++; // Move past '['
            const closeBracket = script.indexOf(']', i);
            if (closeBracket !== -1) {
              const val = parseInt(script.substring(i, closeBracket), 10);
              if (!isNaN(val)) {
                flushText();
                commands.push({ type: 'wait', value: val });
              }
              i = closeBracket + 1;
            }
          } else if (i < script.length && /[0-9]/.test(script[i])) {
            const digit = parseInt(script[i], 10);
            flushText();
            commands.push({ type: 'wait', value: digit * 50 });
            i++;
          }
        } else if (nextChar === '_') {
          i++; // Move past '_'
          // Check for \_w[n] or \_q
          if (script[i] === 'w') {
            i++; // Move past 'w'
            if (script[i] === '[') {
              i++; // Move past '['
              const closeBracket = script.indexOf(']', i);
              if (closeBracket !== -1) {
                const val = parseInt(script.substring(i, closeBracket), 10);
                if (!isNaN(val)) {
                  flushText();
                  commands.push({ type: 'wait', value: val });
                }
                i = closeBracket + 1;
              }
            }
          } else if (script[i] === 'q') {
            // Toggle quick typing, skip
            i++;
          } else {
            // Skip other custom tags under \_
            if (script[i] === '[') {
              const closeBracket = script.indexOf(']', i);
              if (closeBracket !== -1) {
                i = closeBracket + 1;
              } else {
                i++;
              }
            } else {
              i++;
            }
          }
        } else if (nextChar === 'q') {
          i++; // Move past 'q'

          // Kawari-style: \qN[ID][Label] — e.g. \q0[Manzai][交信]
          // N is one or more digits optionally prefixed (e.g. 0, 1, 10...)
          let kawariNum = '';
          while (i < script.length && /[0-9]/.test(script[i])) {
            kawariNum += script[i];
            i++;
          }

          if (kawariNum.length > 0 && script[i] === '[') {
            // Kawari format: \qN[id][label]
            i++; // Move past '['
            const idClose = script.indexOf(']', i);
            if (idClose !== -1) {
              const id = script.substring(i, idClose).trim();
              i = idClose + 1;
              // Now expect [label]
              if (script[i] === '[') {
                i++; // Move past '['
                const labelClose = script.indexOf(']', i);
                if (labelClose !== -1) {
                  const label = script.substring(i, labelClose).trim();
                  i = labelClose + 1;
                  if (label) {
                    flushText();
                    commands.push({ type: 'choice', label, id });
                  }
                }
              }
            }
          } else if (kawariNum.length === 0 && script[i] === '[') {
            // Standard format: \q[label,id]
            i++; // Move past '['
            const closeBracket = script.indexOf(']', i);
            if (closeBracket !== -1) {
              const inner = script.substring(i, closeBracket);
              const commaIdx = inner.indexOf(',');
              if (commaIdx !== -1) {
                const label = inner.slice(0, commaIdx).trim();
                const id = inner.slice(commaIdx + 1).trim();
                if (label) {
                  flushText();
                  commands.push({ type: 'choice', label, id });
                }
              }
              i = closeBracket + 1;
            }
          }
          // else: unrecognized format, skip
        } else {
          // Skip other unknown commands
          if (script[i] === '[') {
            const closeBracket = script.indexOf(']', i);
            if (closeBracket !== -1) {
              i = closeBracket + 1;
            } else {
              i++;
            }
          } else {
            i++;
          }
        }
      } else {
        textBuffer += script[i];
        i++;
      }
    }

    flushText();
    return commands;
  }

  /**
   * Helper to execute parsed commands in sequence.
   * Calls stateCallback with updated player state on every character typed or tag parsed.
   */
  public static async play(
    commands: SakuraScriptCommand[],
    stateCallback: (state: SakuraPlayerState) => void,
    _onChoiceSelect: (choiceId: string) => void,
    typingSpeedMs: number = 40,
    signal?: AbortSignal,
    translateFn?: (scope: number, text: string) => Promise<string | null>,
    readingDelayMs: number = 2000
  ): Promise<void> {
    const state: SakuraPlayerState = {
      scope: 0,
      surfaces: { 0: 0, 1: 10 }, // default surfaces
      texts: { 0: '', 1: '' },
      choices: { 0: [], 1: [] },
      isFinished: false,
    };

    // Emit initial state
    stateCallback({ ...state });

    const sleep = (ms: number) => new Promise<void>((resolve) => {
      const timer = setTimeout(() => {
        if (signal) {
          signal.removeEventListener('abort', onAbort);
        }
        resolve();
      }, ms);

      const onAbort = () => {
        clearTimeout(timer);
        resolve();
      };

      if (signal) {
        signal.addEventListener('abort', onAbort);
      }
    });

    const translateCurrentScopeIfNeeded = async () => {
      if (!translateFn || signal?.aborted) return;
      const currentText = state.texts[state.scope]?.trim();
      if (!currentText) return;

      const hasJapanese = /[\u3000-\u303f\u3040-\u309f\u30a0-\u30ff\uff00-\uffef\u4e00-\u9faf]/.test(currentText);
      if (!hasJapanese) return;

      try {
        const translated = await translateFn(state.scope, currentText);
        if (translated && !signal?.aborted) {
          await sleep(readingDelayMs);
        }
      } catch (err) {
        console.error('SakuraScriptParser translateCurrentScopeIfNeeded error:', err);
      }
    };

    for (const cmd of commands) {
      if (signal?.aborted) break;

      switch (cmd.type) {
        case 'scope':
          if (cmd.value !== state.scope) {
            await translateCurrentScopeIfNeeded();
          }
          state.scope = cmd.value;
          stateCallback({ ...state });
          break;

        case 'surface': {
          // In Ukagaka, scope 1 (Kero) surfaces are offset by 10:
          // \1\s[0] → shell surface 10, \1\s[1] → shell surface 11, etc.
          // Scope 0 (Sakura) uses surface IDs as-is.
          const surfaceValue = state.scope === 1 && cmd.value < 10
            ? 10 + cmd.value
            : cmd.value;
          state.surfaces[state.scope] = surfaceValue;
          stateCallback({ ...state });
          break;
        }

        case 'wait':
          await sleep(cmd.value);
          break;

        case 'newline':
          state.texts[state.scope] += '\n';
          stateCallback({ ...state });
          break;

        case 'clear':
          await translateCurrentScopeIfNeeded();
          state.texts[state.scope] = '';
          state.choices[state.scope] = [];
          stateCallback({ ...state });
          break;

        case 'choice':
          state.choices[state.scope].push({ label: cmd.label, id: cmd.id });
          stateCallback({ ...state });
          break;

        case 'text':
          for (let charIndex = 0; charIndex < cmd.value.length; charIndex++) {
            if (signal?.aborted) break;
            state.texts[state.scope] += cmd.value[charIndex];
            stateCallback({ ...state });
            await sleep(typingSpeedMs);
          }
          break;

        case 'end':
          await translateCurrentScopeIfNeeded();
          state.isFinished = true;
          stateCallback({ ...state });
          return;
      }
    }

    if (!state.isFinished) {
      await translateCurrentScopeIfNeeded();
    }
    state.isFinished = true;
    stateCallback({ ...state });
  }
}
