const MEMORY_REQUIRED_PATTERNS = [
  // Temporal references to past conversations
  /\b(yesterday|last\s+time|earlier|before|previously|ago)\b/i,
  /\b(the\s+other\s+day|last\s+week|when\s+we\s+talked)\b/i,

  // Direct memory/recall language
  /\b(remember|recall|you\s+said|you\s+mentioned|you\s+told\s+me)\b/i,
  /\b(we\s+discussed|we\s+talked\s+about|we\s+built|we\s+worked\s+on)\b/i,

  // Continuity from previous context
  /\b(continue|keep\s+going|more\s+on\s+that|elaborate\s+on\s+that)\b/i,
  /\b(build\s+on|expand\s+on|keep\s+working\s+on|finish\s+that)\b/i,

  // User-specific preferences/context
  /\b(my\s+preferred|as\s+I\s+told\s+you|my\s+usual|my\s+favorite)\b/i,
  /\b(based\s+on\s+my|using\s+my\s+previous)\b/i,

  // Personal information queries
  /\b(do\s+you\s+know\s+me|what\s+do\s+you\s+know\s+about\s+me|who\s+am\s+I)\b/i,
  /\b(tell\s+me\s+about\s+myself|what\s+have\s+I\s+shared|my\s+background)\b/i,
  /\b(what'?s\s+my\s+name|what\s+do\s+I\s+do|where\s+am\s+I\s+from)\b/i,

  // Follow-up question markers (without current context)
  /^(what\s+about|how\s+about|what\s+else|anything\s+else|more\s+about)/i,
];

const MEMORY_NOT_REQUIRED_PATTERNS = [
  // References to current attachments
  /\b(this|that|the)\s+(document|PDF|file|attached|image|picture)\b/i,
  /^(summarize|analyze|explain|describe)\s+(this|that|the|it)\b/i,
  /\bwhat'?s\s+in\s+(this|that|the)\b/i,

  // General knowledge questions
  /^(what\s+is|how\s+does|explain|define|who\s+is|where\s+is|when\s+was|why\s+does)\b/i,

  // Simple greetings
  /^(hi|hello|hey|good\s+morning|good\s+afternoon|good\s+evening|how\s+are\s+you)[!?.,\s]*$/i,

  // Standalone creative requests
  /^(write|create|generate|make)\s+(a|an|some)/i,
];

export function shouldQueryMemoryFast(query: string): boolean {
  if (!query || query.trim().length < 3) {
    return false;
  }
  const normalized = query.toLowerCase().trim();
  
  let hasRequiredPattern = false;
  let hasNotRequiredPattern = false;
  
  for (const pattern of MEMORY_REQUIRED_PATTERNS) {
    if (pattern.test(normalized)) {
      hasRequiredPattern = true;
      break;
    }
  }
  
  for (const pattern of MEMORY_NOT_REQUIRED_PATTERNS) {
    if (pattern.test(normalized)) {
      hasNotRequiredPattern = true;
      break;
    }
  }
  
  if (hasRequiredPattern) {
    return true;
  }
  
  if (hasNotRequiredPattern) {
    return false;
  }
  
  return false;
}

export class MemoryClassificationCache {
  private cache = new Map<string, { decision: boolean; timestamp: number }>();
  private readonly TTL = 5 * 60 * 1000; // 5 minutes
  private readonly MAX_SIZE = 1000;

  get(query: string): boolean | null {
    const key = query.toLowerCase().trim();
    const cached = this.cache.get(key);

    if (cached && Date.now() - cached.timestamp < this.TTL) {
      return cached.decision;
    }

    if (cached) {
      this.cache.delete(key);
    }

    return null;
  }

  set(query: string, decision: boolean): void {
    const key = query.toLowerCase().trim();
    this.cache.set(key, { decision, timestamp: Date.now() });

    if (this.cache.size > this.MAX_SIZE) {
      const now = Date.now();
      const toDelete: string[] = [];

      for (const [k, v] of this.cache.entries()) {
        if (now - v.timestamp > this.TTL) {
          toDelete.push(k);
        }
      }

      toDelete.forEach(k => this.cache.delete(k));

      if (this.cache.size > this.MAX_SIZE) {
        const entries = Array.from(this.cache.entries());
        entries.sort((a, b) => a[1].timestamp - b[1].timestamp);
        const removeCount = this.cache.size - this.MAX_SIZE + 100;

        for (let i = 0; i < removeCount; i++) {
          this.cache.delete(entries[i][0]);
        }
      }
    }
  }

  clear(): void {
    this.cache.clear();
  }
}

export const memoryClassificationCache = new MemoryClassificationCache();

export function shouldQueryMemoryWithCache(query: string): boolean {
  const cached = memoryClassificationCache.get(query);
  if (cached !== null) {
    return cached;
  }

  const decision = shouldQueryMemoryFast(query);
  memoryClassificationCache.set(query, decision);

  return decision;
}
