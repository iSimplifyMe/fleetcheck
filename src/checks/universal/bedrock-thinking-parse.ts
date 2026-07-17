/**
 * bedrock-thinking-parse — flag positional parsing of an Anthropic-on-Bedrock
 * response (`content[0].text` / `["content"][0]["text"]`).
 *
 * Why this breaks: Sonnet 5, Opus 4.7, Opus 4.8, and Fable 5 run ADAPTIVE
 * THINKING BY DEFAULT when the InvokeModel/Converse body omits a `thinking`
 * field. On those models `content[0]` is a THINKING block, which has no `text`
 * key — so `content[0].text` reads undefined (JS: silent fallback or throw;
 * Python: KeyError). The caller decides the model returned nothing. Sonnet 4.6,
 * Sonnet 4.5, Opus 4.6, and Haiku run thinking OFF by default, so the idiom is
 * correct there TODAY — the hazard is latent until a model bump.
 *
 * Severity is therefore model-aware:
 *   - `error`   when the same file also references a thinking-by-default model
 *               id (a LIVE break — that repo's AI output is already broken, or
 *               will be on the next deploy).
 *   - `warning` otherwise (a LATENT break — correct today on a thinking-off
 *               model, breaks the moment the model id is bumped).
 *
 * The fix is a block-aware parser that concatenates `type === "text"` blocks and
 * skips thinking/tool_use — see apex-portal `src/lib/bedrock-text.ts`
 * (`bedrockText()`), the reference implementation. Interactive/agentic paths may
 * instead pin `thinking: { type: "disabled" }` in the request body.
 *
 * Scope gate (two signals required in the SAME file, so this never fires on
 * OpenAI `choices[0].message.content`, Bedrock Nova/Titan image models, or
 * non-Bedrock code): the file must reference Bedrock InvokeModel/Converse AND an
 * Anthropic marker. Comment lines are blanked before matching so a warning
 * comment that names the bad idiom is not itself flagged.
 */

import { join } from "node:path";
import type { Check, Finding, Severity } from "../../types.js";
import { sourceFiles, readFileSafe } from "../lib.js";

const SCAN_GLOBS = ["**/*.{ts,tsx,js,jsx,mjs,cjs,py}"];

/** File calls Bedrock InvokeModel or Converse (JS SDK or boto3). */
const BEDROCK_SIGNAL =
  /InvokeModel|ConverseStream|ConverseCommand|bedrock-runtime|bedrock_runtime|BedrockRuntime|invoke_model|\bconverse\b/;

/** File targets an Anthropic model on Bedrock (not Nova/Titan/OpenAI/Gemini). */
const ANTHROPIC_SIGNAL =
  /anthropic_version|us\.anthropic|global\.anthropic|anthropic\.claude|claude-(?:sonnet|opus|haiku)/;

/**
 * A thinking-BY-DEFAULT Anthropic model in the file escalates the finding to
 * `error`. Substrings uniquely identify these models: "sonnet-5" does not occur
 * in "sonnet-4-5"/"sonnet-4-6", "opus-4-7"/"opus-4-8" do not occur in
 * "opus-4-6". Keep this list in sync as new thinking-default models ship.
 */
const THINKING_DEFAULT_MODEL =
  /sonnet-5|opus-4-7|opus-4-8|fable-5|mythos-5/;

/** `content[0].text`, `content?.[0]?.text`, `content[0]?.text`, `.content[0].text`. */
const POSITIONAL_DOT =
  /\bcontent\s*(?:\?\.)?\s*\[\s*0\s*\]\s*(?:\?\.|\.)\s*text\b/;

/** `["content"][0]["text"]`, `['content'][0]['text']` (Python + JS bracket form). */
const POSITIONAL_BRACKET =
  /\[\s*(['"])content\1\s*\]\s*\[\s*0\s*\]\s*\[\s*(['"])text\2\s*\]/;

/**
 * Skip test files. A `content[0].text` in a test asserts on a constructed
 * request (`messages[0].content[0].text`) or parses a MOCKED response — neither
 * touches a live model, so neither can break in prod. This is role/shape-based
 * scoping, NOT the path-blindness anti-pattern: a leaked secret is exploitable
 * wherever it sits (so secret scanners must read test dirs), but a mocked-model
 * parse is definitionally not a runtime hazard.
 */
function isTestFile(rel: string): boolean {
  const parts = rel.split("/");
  const base = parts[parts.length - 1];
  if (/\.(test|spec)\.[cm]?[jt]sx?$/.test(base)) return true;
  if (/^test_.*\.py$/.test(base) || /_test\.py$/.test(base) || base === "conftest.py") {
    return true;
  }
  return parts.some(
    (p) => p === "test" || p === "tests" || p === "__tests__" || p === "__mocks__",
  );
}

/**
 * Blank whole-line comments and block comments so a comment that mentions the
 * bad idiom (e.g. `// NOT content[0].text`) is not flagged. Newlines are
 * preserved so reported line numbers stay accurate. Trailing `//` comments are
 * intentionally NOT stripped — that would corrupt `https://` inside strings, and
 * a real violation always occupies its own code line.
 */
function stripComments(content: string, isPython: boolean): string {
  let src = content;
  if (!isPython) {
    // Block comments: replace every non-newline char with a space.
    src = src.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "));
  }
  const lineComment = isPython ? /^\s*#/ : /^\s*(?:\/\/|\*|\/\*)/;
  return src
    .split(/\r?\n/)
    .map((line) => (lineComment.test(line) ? "" : line))
    .join("\n");
}

export const bedrockThinkingParse: Check = {
  id: "bedrock-thinking-parse",
  title:
    "Bedrock Anthropic responses parsed positionally break on thinking-capable models",
  severity: "error",
  appliesTo: () => true,
  run(repo): Finding[] {
    const findings: Finding[] = [];
    for (const rel of sourceFiles(repo.path, SCAN_GLOBS)) {
      if (isTestFile(rel)) continue;
      const content = readFileSafe(join(repo.path, rel));
      if (content === null) continue;

      // Scope gate: Anthropic AND Bedrock in the same file, or skip entirely.
      if (!BEDROCK_SIGNAL.test(content) || !ANTHROPIC_SIGNAL.test(content)) {
        continue;
      }

      const live = THINKING_DEFAULT_MODEL.test(content);
      const severity: Severity = live ? "error" : "warning";
      const code = stripComments(content, rel.endsWith(".py"));
      const lines = code.split(/\r?\n/);

      for (let i = 0; i < lines.length; i++) {
        if (POSITIONAL_DOT.test(lines[i]) || POSITIONAL_BRACKET.test(lines[i])) {
          findings.push({
            checkId: "bedrock-thinking-parse",
            severity,
            message: live
              ? "Positional content[0].text on an Anthropic Bedrock response, and this file pins a thinking-by-default model (Sonnet 5 / Opus 4.7+ / Fable 5) — content[0] is the thinking block, so this reads no text. Parse block-aware (see apex-portal bedrockText()) or pin thinking:{type:'disabled'}."
              : "Positional content[0].text on an Anthropic Bedrock response. Correct today (thinking-off model) but breaks silently the moment this file is flipped to a thinking-by-default model. Parse block-aware (see apex-portal bedrockText()).",
            file: rel,
            line: i + 1,
            meta: { tier: live ? "live" : "latent" },
          });
        }
      }
    }
    return findings;
  },
};
