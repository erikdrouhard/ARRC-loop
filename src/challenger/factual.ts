import type { ArcJudgeInput, StructuredChallenge } from "../types.js";

const ABSOLUTE_CLAIM_PATTERN =
  /\b(?:always|never|every|all|none|no one|everyone|nobody|nothing|everything|guaranteed|impossible|certain(?:ly)?|definitely|undeniable|unquestionable|proven fact|known fact|indisputable)\b/i;

const CAUSAL_CLAIM_PATTERN =
  /\b(?:causes?|leads?\s+to|results?\s+in|ensures?|prevents?|eliminates?|produces?|creates?|makes?\s+(?:it|them|this|that))\b/i;

const QUANTITATIVE_CLAIM_PATTERN =
  /\b(?:\d+%|\d+x|twice|triple|half|double|majority|most|few|many|several|hundreds|thousands|millions)\b/i;

const EVIDENCE_MARKERS =
  /(?:\b(?:according to|source|citation|study|research|data|evidence|measured|tested|verified|confirmed|observed|documented|reported|because|since|given that|as shown)\b|https?:\/\/|\[\d+\])/i;

interface ExtractedClaim {
  text: string;
  sentence: string;
  type: "absolute" | "causal" | "quantitative";
}

function extractSentences(draft: string): string[] {
  return draft
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function extractClaims(draft: string): ExtractedClaim[] {
  const sentences = extractSentences(draft);
  const claims: ExtractedClaim[] = [];

  for (const sentence of sentences) {
    if (ABSOLUTE_CLAIM_PATTERN.test(sentence)) {
      const match = sentence.match(ABSOLUTE_CLAIM_PATTERN);
      claims.push({
        text: sentence,
        sentence,
        type: "absolute",
      });
      // Reset lastIndex for global patterns
      if (match) ABSOLUTE_CLAIM_PATTERN.lastIndex = 0;
    }

    if (CAUSAL_CLAIM_PATTERN.test(sentence)) {
      claims.push({
        text: sentence,
        sentence,
        type: "causal",
      });
    }

    if (QUANTITATIVE_CLAIM_PATTERN.test(sentence)) {
      claims.push({
        text: sentence,
        sentence,
        type: "quantitative",
      });
    }
  }

  // Deduplicate by sentence
  const seen = new Set<string>();
  return claims.filter((c) => {
    if (seen.has(c.sentence)) return false;
    seen.add(c.sentence);
    return true;
  });
}

function hasEvidenceSupport(sentence: string, draft: string): boolean {
  // Check if the sentence itself contains evidence markers
  if (EVIDENCE_MARKERS.test(sentence)) return true;

  // Check surrounding context (next sentence)
  const sentenceIndex = draft.indexOf(sentence);
  if (sentenceIndex === -1) return false;

  const afterSentence = draft.slice(sentenceIndex + sentence.length, sentenceIndex + sentence.length + 200);
  return EVIDENCE_MARKERS.test(afterSentence);
}

function generateCounterargument(claim: ExtractedClaim): string {
  switch (claim.type) {
    case "absolute":
      return `The absolute claim "${claim.text.slice(0, 80)}" asserts universality without accounting for edge cases or exceptions that commonly exist in practice.`;
    case "causal":
      return `The causal relationship claimed in "${claim.text.slice(0, 80)}" assumes direct causation without ruling out confounding factors, reverse causation, or correlation-only relationships.`;
    case "quantitative":
      return `The quantitative assertion in "${claim.text.slice(0, 80)}" lacks a cited source or methodology, making the specific numbers unverifiable.`;
  }
}

function generateFailureScenario(claim: ExtractedClaim): string {
  switch (claim.type) {
    case "absolute":
      return `A user encounters a legitimate edge case where the absolute claim does not hold, leading them to distrust the entire response because one universally-stated claim was false.`;
    case "causal":
      return `The claimed causal relationship breaks down when the confounding variable is controlled for, or when the relationship reverses in a different context (e.g., different scale, different domain, different population).`;
    case "quantitative":
      return `The stated quantity is off by a significant margin when checked against a primary source, undermining the credibility of the surrounding analysis.`;
  }
}

function computeSignal(claim: ExtractedClaim, hasEvidence: boolean): number {
  let signal = 0.3; // baseline

  // Absolute claims without evidence are highest signal
  if (claim.type === "absolute" && !hasEvidence) signal += 0.4;
  else if (claim.type === "absolute") signal += 0.15;

  // Causal claims are moderately concerning
  if (claim.type === "causal" && !hasEvidence) signal += 0.35;
  else if (claim.type === "causal") signal += 0.1;

  // Quantitative claims without source
  if (claim.type === "quantitative" && !hasEvidence) signal += 0.35;
  else if (claim.type === "quantitative") signal += 0.05;

  return Math.min(1, signal);
}

function computeSeverity(signal: number, _claim: ExtractedClaim): StructuredChallenge["severity"] {
  if (signal >= 0.7) return "high";
  if (signal >= 0.5) return "medium";
  return "low";
}

export function challengeFactual(
  draft: string,
  _input: ArcJudgeInput,
): StructuredChallenge[] {
  const claims = extractClaims(draft);
  const challenges: StructuredChallenge[] = [];

  for (const claim of claims) {
    const hasEvidence = hasEvidenceSupport(claim.sentence, draft);
    const signal = computeSignal(claim, hasEvidence);

    // Only generate challenges for claims that have meaningful signal
    if (signal < 0.4) continue;

    const counterargument = generateCounterargument(claim);
    const failureScenario = generateFailureScenario(claim);

    // Enforce minimum specificity
    if (counterargument.length < 20 || failureScenario.length < 20) continue;

    challenges.push({
      id: `factual:${challenges.length}`,
      category: "factual",
      severity: computeSeverity(signal, claim),
      claim: claim.text,
      counterargument,
      failureScenario,
      signal,
    });
  }

  return challenges;
}
