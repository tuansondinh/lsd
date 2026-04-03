/**
 * Bash stream processor — single-pass UTF-8 decode + ANSI strip + binary sanitization.
 *
 * Handles chunk boundaries for incomplete UTF-8 and ANSI escape sequences.
 */

import { native } from "../native.js";

export interface StreamState {
  utf8Pending: number[];
  ansiPending: number[];
}

export interface StreamChunkResult {
  text: string;
  state: StreamState;
}

function hasNativeFn(name: string): boolean {
  return typeof (native as Record<string, unknown>)[name] === "function";
}

function splitIncompleteUtf8(buffer: Buffer): { complete: Buffer; pending: number[] } {
  const len = buffer.length;
  if (len === 0) return { complete: buffer, pending: [] };

  let continuationBytes = 0;
  let start = len;
  while (start > 0 && continuationBytes < 3) {
    const byte = buffer[start - 1];
    if ((byte & 0b1100_0000) === 0b1000_0000) {
      continuationBytes += 1;
      start -= 1;
      continue;
    }
    break;
  }

  if (start === len) {
    return { complete: buffer, pending: [] };
  }

  const leadIndex = start - 1;
  if (leadIndex < 0) {
    return { complete: Buffer.alloc(0), pending: Array.from(buffer) };
  }

  const lead = buffer[leadIndex];
  let expectedLength = 1;
  if ((lead & 0b1000_0000) === 0) expectedLength = 1;
  else if ((lead & 0b1110_0000) === 0b1100_0000) expectedLength = 2;
  else if ((lead & 0b1111_0000) === 0b1110_0000) expectedLength = 3;
  else if ((lead & 0b1111_1000) === 0b1111_0000) expectedLength = 4;
  else return { complete: buffer.subarray(0, leadIndex), pending: Array.from(buffer.subarray(leadIndex)) };

  const actualLength = len - leadIndex;
  if (actualLength < expectedLength) {
    return {
      complete: buffer.subarray(0, leadIndex),
      pending: Array.from(buffer.subarray(leadIndex)),
    };
  }

  return { complete: buffer, pending: [] };
}

function stripTrailingAnsiSequence(text: string): { text: string; ansiPending: number[] } {
  const escIndex = text.lastIndexOf("\u001b");
  if (escIndex === -1) return { text, ansiPending: [] };

  const tail = text.slice(escIndex);
  // Incomplete CSI sequence at end, e.g. ESC[, ESC[31, ESC[?25
  if (/^\u001b(?:\[[0-9;?]*)?$/.test(tail)) {
    return {
      text: text.slice(0, escIndex),
      ansiPending: Array.from(Buffer.from(tail, "utf8")),
    };
  }

  return { text, ansiPending: [] };
}

function stripAnsiJs(text: string): string {
  return text.replace(/\u001B\][^\u0007]*(?:\u0007|\u001B\\)/g, "").replace(/\u001B\[[0-?]*[ -/]*[@-~]/g, "");
}

function sanitizeBinaryOutputJs(str: string): string {
  return Array.from(str)
    .filter((char) => {
      const code = char.codePointAt(0);
      if (code === undefined) return false;
      if (code === 0x09 || code === 0x0a) return true;
      if (code === 0x0d) return false;
      if (code <= 0x1f) return false;
      if (code >= 0xfff9 && code <= 0xfffb) return false;
      return true;
    })
    .join("");
}

function processStreamChunkJs(chunk: Buffer, state?: StreamState): StreamChunkResult {
  const utf8Pending = state?.utf8Pending ?? [];
  const ansiPending = state?.ansiPending ?? [];
  const merged = Buffer.concat([
    Buffer.from(utf8Pending),
    Buffer.from(ansiPending),
    chunk,
  ]);

  const { complete, pending } = splitIncompleteUtf8(merged);
  const decoded = complete.toString("utf8");
  const stripped = stripTrailingAnsiSequence(decoded);
  const cleaned = sanitizeBinaryOutputJs(stripAnsiJs(stripped.text));

  return {
    text: cleaned,
    state: {
      utf8Pending: pending,
      ansiPending: stripped.ansiPending,
    },
  };
}

/**
 * Process a raw bash output chunk in a single pass.
 *
 * Decodes UTF-8 (handling incomplete multibyte sequences at boundaries),
 * strips ANSI escape sequences, removes control characters (except tab and
 * newline), removes carriage returns, and filters Unicode format characters.
 *
 * Pass the returned `state` to the next call to handle sequences split
 * across chunk boundaries.
 */
export function processStreamChunk(
  chunk: Buffer,
  state?: StreamState,
): StreamChunkResult {
  if (!hasNativeFn("processStreamChunk")) {
    return processStreamChunkJs(chunk, state);
  }

  const napiState = state
    ? {
        utf8Pending: Array.from(state.utf8Pending),
        ansiPending: Array.from(state.ansiPending),
      }
    : undefined;

  const result = (native as Record<string, Function>).processStreamChunk(
    chunk,
    napiState,
  ) as {
    text: string;
    state: { utf8Pending: Buffer; ansiPending: Buffer };
  };

  return {
    text: result.text,
    state: {
      utf8Pending: Array.from(result.state.utf8Pending),
      ansiPending: Array.from(result.state.ansiPending),
    },
  };
}

/**
 * Strip ANSI escape sequences from a string.
 */
export function stripAnsiNative(text: string): string {
  if (!hasNativeFn("stripAnsiNative")) {
    return stripAnsiJs(text);
  }
  return (native as Record<string, Function>).stripAnsiNative(text) as string;
}

/**
 * Remove binary garbage and control characters from a string.
 *
 * Keeps tab and newline. Removes carriage return, all other control
 * characters, Unicode format characters (U+FFF9-U+FFFB), and lone surrogates.
 */
export function sanitizeBinaryOutputNative(text: string): string {
  if (!hasNativeFn("sanitizeBinaryOutputNative")) {
    return sanitizeBinaryOutputJs(text);
  }
  return (native as Record<string, Function>).sanitizeBinaryOutputNative(
    text,
  ) as string;
}
