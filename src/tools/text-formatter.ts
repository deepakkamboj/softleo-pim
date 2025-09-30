import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

// Unicode Serif Bold mapping
export const BOLD_SERIF_MAP: Record<string, string> = {
    'a': '𝐚', 'b': '𝐛', 'c': '𝐜', 'd': '𝐝', 'e': '𝐞', 'f': '𝐟', 'g': '𝐠', 'h': '𝐡', 'i': '𝐢', 'j': '𝐣',
    'k': '𝐤', 'l': '𝐥', 'm': '𝐦', 'n': '𝐧', 'o': '𝐨', 'p': '𝐩', 'q': '𝐪', 'r': '𝐫', 's': '𝐬', 't': '𝐭',
    'u': '𝐮', 'v': '𝐯', 'w': '𝐰', 'x': '𝐱', 'y': '𝐲', 'z': '𝐳',
    'A': '𝐀', 'B': '𝐁', 'C': '𝐂', 'D': '𝐃', 'E': '𝐄', 'F': '𝐅', 'G': '𝐆', 'H': '𝐇', 'I': '𝐈', 'J': '𝐉',
    'K': '𝐊', 'L': '𝐋', 'M': '𝐌', 'N': '𝐍', 'O': '𝐎', 'P': '𝐏', 'Q': '𝐐', 'R': '𝐑', 'S': '𝐒', 'T': '𝐓',
    'U': '𝐔', 'V': '𝐕', 'W': '𝐖', 'X': '𝐗', 'Y': '𝐘', 'Z': '𝐙',
    '0': '𝟎', '1': '𝟏', '2': '𝟐', '3': '𝟑', '4': '𝟒', '5': '𝟓', '6': '𝟔', '7': '𝟕', '8': '𝟖', '9': '𝟗'
};

// Unicode Serif Italic mapping
export const ITALIC_SERIF_MAP: Record<string, string> = {
    'a': '𝑎', 'b': '𝑏', 'c': '𝑐', 'd': '𝑑', 'e': '𝑒', 'f': '𝑓', 'g': '𝑔', 'h': '𝒉', 'i': '𝑖', 'j': '𝑗',
    'k': '𝑘', 'l': '𝑙', 'm': '𝑚', 'n': '𝑛', 'o': '𝑜', 'p': '𝑝', 'q': '𝑞', 'r': '𝑟', 's': '𝑠', 't': '𝑡',
    'u': '𝑢', 'v': '𝑣', 'w': '𝑤', 'x': '𝑥', 'y': '𝑦', 'z': '𝑧',
    'A': '𝐴', 'B': '𝐵', 'C': '𝐶', 'D': '𝐷', 'E': '𝐸', 'F': '𝐹', 'G': '𝐺', 'H': '𝐻', 'I': '𝐼', 'J': '𝐽',
    'K': '𝐾', 'L': '𝐿', 'M': '𝑀', 'N': '𝑁', 'O': '𝑂', 'P': '𝑃', 'Q': '𝑄', 'R': '𝑅', 'S': '𝑆', 'T': '𝑇',
    'U': '𝑈', 'V': '𝑉', 'W': '𝑊', 'X': '𝑋', 'Y': '𝑌', 'Z': '𝑍',
    '0': '𝟎', '1': '𝟏', '2': '𝟐', '3': '𝟑', '4': '𝟒', '5': '𝟓', '6': '𝟔', '7': '𝟕', '8': '𝟖', '9': '𝟗'
};

// Unicode Serif Bold Italic mapping
export const BOLD_ITALIC_SERIF_MAP: Record<string, string> = {
    'a': '𝒂', 'b': '𝒃', 'c': '𝒄', 'd': '𝒅', 'e': '𝒆', 'f': '𝒇', 'g': '𝒈', 'h': '𝒉', 'i': '𝒊', 'j': '𝒋',
    'k': '𝒌', 'l': '𝒍', 'm': '𝒎', 'n': '𝒏', 'o': '𝒐', 'p': '𝒑', 'q': '𝒒', 'r': '𝒓', 's': '𝒔', 't': '𝒕',
    'u': '𝒖', 'v': '𝒗', 'w': '𝒘', 'x': '𝒙', 'y': '𝒚', 'z': '𝒛',
    'A': '𝑨', 'B': '𝑩', 'C': '𝑪', 'D': '𝑫', 'E': '𝑬', 'F': '𝑭', 'G': '𝑮', 'H': '𝑯', 'I': '𝑰', 'J': '𝑱',
    'K': '𝑲', 'L': '𝑳', 'M': '𝑴', 'N': '𝑵', 'O': '𝑶', 'P': '𝑷', 'Q': '𝑸', 'R': '𝑹', 'S': '𝑺', 'T': '𝑻',
    'U': '𝑼', 'V': '𝑽', 'W': '𝑾', 'X': '𝑿', 'Y': '𝒀', 'Z': '𝒁',
    '0': '𝟎', '1': '𝟏', '2': '𝟐', '3': '𝟑', '4': '𝟒', '5': '𝟓', '6': '𝟔', '7': '𝟕', '8': '𝟖', '9': '𝟗'
};

/**
 * Convert string to Unicode Bold Serif
 */
export function toBoldSerif(text: string): string {
    return text
        .split('')
        .map(char => BOLD_SERIF_MAP[char] || char)
        .join('');
}

/**
 * Convert string to Unicode Italic Serif
 */
export function toItalicSerif(text: string): string {
    return text
        .split('')
        .map(char => ITALIC_SERIF_MAP[char] || char)
        .join('');
}

/**
 * Convert string to Unicode Bold Italic Serif
 */
export function toBoldItalicSerif(text: string): string {
    return text
        .split('')
        .map(char => BOLD_ITALIC_SERIF_MAP[char] || char)
        .join('');
}

export function registerTextFormatterTools(
  server: McpServer,
  config?: Record<string, any>
) {
  server.tool(
    "text_to_bold_serif",
    "Convert text to Unicode Bold Serif characters (𝐇𝐞𝐥𝐥𝐨 𝐖𝐨𝐫𝐥𝐝 𝟏𝟐𝟑)",
    {
      text: z.string().describe("Text to convert to bold serif")
    },
    async (params) => {
      const converted = toBoldSerif(params.text);
      return {
        content: [
          {
            type: "text",
            text: `Original: ${params.text}\nBold Serif: ${converted}`
          }
        ]
      };
    }
  );

  server.tool(
    "text_to_italic_serif", 
    "Convert text to Unicode Italic Serif characters (𝐻𝑒𝑙𝑙𝑜 𝑊𝑜𝑟𝑙𝑑 123)",
    {
      text: z.string().describe("Text to convert to italic serif")
    },
    async (params) => {
      const converted = toItalicSerif(params.text);
      return {
        content: [
          {
            type: "text",
            text: `Original: ${params.text}\nItalic Serif: ${converted}`
          }
        ]
      };
    }
  );

  server.tool(
    "text_to_bold_italic_serif",
    "Convert text to Unicode Bold Italic Serif characters (𝑯𝒆𝒍𝒍𝒐 𝑾𝒐𝒓𝒍𝒅 𝟏𝟐𝟑)",
    {
      text: z.string().describe("Text to convert to bold italic serif")
    },
    async (params) => {
      const converted = toBoldItalicSerif(params.text);
      return {
        content: [
          {
            type: "text",
            text: `Original: ${params.text}\nBold Italic Serif: ${converted}`
          }
        ]
      };
    }
  );

  server.tool(
    "text_formatter_demo",
    "Demonstrate all text formatting styles with sample text or custom input",
    {
      text: z.string().optional().describe("Sample text to demonstrate all formatting styles").default("Hello World 123")
    },
    async (params) => {
      const sampleText = params.text || "Hello World 123";
      return {
        content: [
          {
            type: "text",
            text: `Text Formatting Demo:

Original: ${sampleText}
Bold Serif: ${toBoldSerif(sampleText)}
Italic Serif: ${toItalicSerif(sampleText)}
Bold Italic Serif: ${toBoldItalicSerif(sampleText)}

All characters (a-z, A-Z, 0-9) are supported.
Non-alphabetic characters remain unchanged.`
          }
        ]
      };
    }
  );
}
