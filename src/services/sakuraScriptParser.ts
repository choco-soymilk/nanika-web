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
          if (script[i] === '[') {
            i++; // Move past '['
            const closeBracket = script.indexOf(']', i);
            if (closeBracket !== -1) {
              const inner = script.substring(i, closeBracket);
              const parts = inner.split(',');
              if (parts.length >= 2) {
                const label = parts[0].trim();
                const id = parts[1].trim();
                flushText();
                commands.push({ type: 'choice', label, id });
              }
              i = closeBracket + 1;
            }
          }
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
    signal?: AbortSignal
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

    for (const cmd of commands) {
      if (signal?.aborted) break;

      switch (cmd.type) {
        case 'scope':
          state.scope = cmd.value;
          stateCallback({ ...state });
          break;

        case 'surface':
          state.surfaces[state.scope] = cmd.value;
          stateCallback({ ...state });
          break;

        case 'wait':
          await sleep(cmd.value);
          break;

        case 'newline':
          state.texts[state.scope] += '\n';
          stateCallback({ ...state });
          break;

        case 'clear':
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
          state.isFinished = true;
          stateCallback({ ...state });
          return;
      }
    }

    state.isFinished = true;
    stateCallback({ ...state });
  }
}
