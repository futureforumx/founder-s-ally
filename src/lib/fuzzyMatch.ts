/**
 * Calculate the Levenshtein distance between two strings.
 * This is used for fuzzy matching with similar words/spellings.
 */
function levenshteinDistance(str1: string, str2: string): number {
  const len1 = str1.length;
  const len2 = str2.length;
  const matrix: number[][] = [];

  for (let i = 0; i <= len2; i++) {
    matrix[i] = [i];
  }

  for (let j = 0; j <= len1; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= len2; i++) {
    for (let j = 1; j <= len1; j++) {
      if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1,     // insertion
          matrix[i - 1][j] + 1      // deletion
        );
      }
    }
  }

  return matrix[len2][len1];
}

/**
 * Check if a word from the search query matches a word in the target string.
 * Uses both exact substring matching and fuzzy matching with Levenshtein distance.
 */
function wordMatches(searchWord: string, targetText: string): boolean {
  const targetWords = targetText.toLowerCase().split(/\s+|[&/,.-]+/);
  const searchLower = searchWord.toLowerCase();

  for (const word of targetWords) {
    // Exact substring match
    if (word.includes(searchLower) || searchLower.includes(word)) {
      return true;
    }

    // Fuzzy match with Levenshtein distance
    // Allow up to 2 character differences for reasonable fuzzy matching
    const distance = levenshteinDistance(searchLower, word);
    const threshold = Math.min(searchLower.length, word.length) / 2;
    if (distance <= threshold) {
      return true;
    }
  }

  return false;
}

/**
 * Fuzzy match a search query against a target string.
 * Returns true if the query matches the target with reasonable fuzziness.
 */
export function fuzzyMatch(query: string, target: string): boolean {
  if (!query.trim()) return true;

  const queryWords = query.toLowerCase().split(/\s+/);

  // All query words should match against the target (AND logic)
  return queryWords.every((word) => wordMatches(word, target));
}

/**
 * Rank matches by relevance.
 * Returns a score where higher is better.
 */
export function calculateMatchScore(query: string, label: string, desc?: string): number {
  if (!query.trim()) return 0;

  const queryLower = query.toLowerCase();
  const labelLower = label.toLowerCase();
  const descLower = (desc || "").toLowerCase();
  const combined = `${labelLower} ${descLower}`;

  let score = 0;

  // Exact label match gets highest score
  if (labelLower === queryLower) return 1000;

  // Label starts with query
  if (labelLower.startsWith(queryLower)) score += 500;

  // Label contains query as substring
  if (labelLower.includes(queryLower)) score += 300;

  // Description contains query
  if (descLower.includes(queryLower)) score += 100;

  // Word-level matching in label
  const queryWords = queryLower.split(/\s+/);
  const labelWords = labelLower.split(/\s+|[&/,.-]+/);

  for (const qWord of queryWords) {
    for (const lWord of labelWords) {
      if (lWord === qWord) score += 200;
      if (lWord.includes(qWord) || qWord.includes(lWord)) score += 150;

      // Levenshtein distance for fuzzy matching
      const distance = levenshteinDistance(qWord, lWord);
      if (distance <= Math.max(qWord.length, lWord.length) / 3) {
        score += 50 * (1 - distance / Math.max(qWord.length, lWord.length));
      }
    }
  }

  return score;
}
