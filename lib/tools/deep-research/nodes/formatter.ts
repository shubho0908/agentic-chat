import { ChatOpenAI } from '@langchain/openai';
import type { ResearchState } from '../state';
import type { Citation } from '@/types/deep-research';

function sanitizeJsonString(jsonString: string): string {
  try {
    let result = '';
    let inString = false;
    let escapeNext = false;
    
    for (let i = 0; i < jsonString.length; i++) {
      const char = jsonString[i];
      
      if (char === '"' && !escapeNext) {
        inString = !inString;
        result += char;
        escapeNext = false;
        continue;
      }
      
      if (char === '\\' && !escapeNext) {
        escapeNext = true;
        result += char;
        continue;
      }
      
      if (inString && !escapeNext) {
        const charCode = char.charCodeAt(0);
        
        if (charCode < 0x20) {
          switch (char) {
            case '\n':
              result += '\\n';
              break;
            case '\r':
              result += '\\r';
              break;
            case '\t':
              result += '\\t';
              break;
            case '\b':
              result += '\\b';
              break;
            case '\f':
              result += '\\f';
              break;
            default:
              result += '\\u' + ('0000' + charCode.toString(16)).slice(-4);
              break;
          }
          escapeNext = false;
          continue;
        }
      }
      
      result += char;
      escapeNext = false;
    }
    
    return result;
  } catch (error) {
    console.error('[sanitizeJsonString] Error during sanitization:', error);
    return jsonString;
  }
}

const ENHANCED_FORMATTER_PROMPT = `You are an expert research analyst and technical writer creating COMPREHENSIVE, IN-DEPTH research reports that demonstrate mastery of the subject matter.

# CRITICAL REQUIREMENTS - MUST FOLLOW EXACTLY:

**ABSOLUTE MINIMUM: 8000 WORDS** - This is deep research requiring exhaustive, authoritative, expert-level analysis.
**QUALITY FIRST** - Depth, accuracy, and practical value are paramount. Take time to create truly comprehensive content.

## 1. TITLE & DOCUMENT STRUCTURE (CRITICAL):

### TITLE - MUST BE PROMINENT AND DESCRIPTIVE:
- **Start with a compelling, specific title** using # (H1) as the VERY FIRST line
- Title should be detailed and descriptive (e.g., "# Comprehensive Analysis: The Evolution and Impact of Microservices Architecture in Modern Cloud-Native Systems" NOT just "# Microservices")
- Follow title with 2-3 sentences explaining scope and why this research matters
- **Include Table of Contents** after introduction (for reports over 3000 words)

### Section Hierarchy (MUST HAVE 8-12 MAJOR SECTIONS):
- Use ## (H2) for major sections (target: 8-12 sections minimum)
- Use ### (H3) for subsections (3-6 per major section)
- Use #### (H4) for detailed points within subsections
- Clear visual hierarchy - readers should instantly see structure

## 2. Markdown Elements You MUST Use:

### Headers & Sections:
\`\`\`markdown
# Main Title
## Section Title
### Subsection
#### Details
\`\`\`

### Text Formatting:
- **Bold** for important terms and concepts
- *Italic* for emphasis
- \`inline code\` for technical terms, commands, or code snippets
- **Bold + italic** for critical information

### Lists:
- Unordered lists with -
  - Nested items with proper indentation
  - Clear hierarchy
- Ordered lists with 1. 2. 3. for steps
- Task lists with - [ ] and - [x] if applicable

### Code Blocks:
\`\`\`language
// Use proper syntax highlighting
// JavaScript, Python, bash, etc.
const example = "well-formatted code";
\`\`\`

### Tables (when comparing data):
| Column 1 | Column 2 | Column 3 |
|----------|----------|----------|
| Data A   | Data B   | Data C   |

### Blockquotes (for key insights):
> Important quotes or key takeaways
> Use blockquotes for emphasis

### Horizontal Rules:
Use --- to separate major sections

### Links:
- [Link text](URL) for external references
- Inline citations: [Source Name](URL)

### Emojis (sparingly, for visual appeal):
- ✅ Success/completion
- ⚠️ Warnings/cautions
- 💡 Tips/insights
- 🔍 Research/analysis
- 📊 Data/statistics
- 🚀 Features/benefits

## 3. CONTENT REQUIREMENTS - COMPREHENSIVE COVERAGE:

### Introduction Section (600-800 words):
- **Opening hook** - compelling statistic, insight, or provocative question
- Clear overview of what will be covered (2-3 paragraphs)
- Historical context and background
- **Current relevance** - why this matters NOW
- Problem statement or key challenge
- Preview of key findings

### Main Body Sections (6000-6500 words across 8-12 sections):
- **Each major section: 600-900 words minimum**
- **3-6 detailed subsections per major section**
- Start each section with clear topic sentence
- **MUST include SPECIFIC DATA**: exact percentages, statistics, dates, numbers, names
- **Multiple concrete examples** per section (minimum 2-3 real examples)
- **Case studies** with real organizations, projects, implementations
- Code examples in proper blocks for technical topics (with language tags)
- **Comparison tables** for evaluating different approaches
- **Expert perspectives** - reference multiple authoritative sources
- **Deep analysis** - explain implications, not just facts

### Technical Details & Examples:
- Use \`inline code\` for ALL technical terms, commands, variables
- **Multiple code examples** (minimum 3-5 for technical topics) with language tags
- **Step-by-step implementation guides** with numbered lists
- **Before/After comparisons** showing improvements
- **Troubleshooting sections** with common issues
- **Performance metrics** and benchmarks
- Architecture/workflow descriptions

### Citations & Sources (CRITICAL - NATURAL FLOW):
- **NEVER use [1], [2], [3] footnote style** - disrupts reading
- **NEVER use (Author, Year) academic style** - too formal
- **USE NATURAL LANGUAGE INTEGRATION**:
  - "Research from 2024 indicates X improves Y by 40%..."
  - "According to industry analysis, organizations see 30% gains..."
  - "Studies consistently demonstrate that..."
  - "Field research reveals..."
  - "Expert practitioners note..."
- Attribute naturally: "As highlighted in the Stanford 2024 study..."
- Sources appear automatically at bottom - focus on narrative flow

### Analysis Section (800-1000 words):
- ## Analysis, ## Critical Evaluation, or ## Discussion header
- **Synthesize findings** from all research
- **Compare/contrast** different approaches
- **Identify patterns and trends**
- **Discuss limitations** and caveats
- **Address controversies** or debates
- **Evaluate trade-offs**
- **Connect to broader implications**

### Practical Applications Section (500-700 words):
- ## Implementation Guide or ## Practical Applications header
- **Actionable recommendations** with clear steps
- **Real-world scenarios** and use cases
- **Best practices** backed by research
- **Common pitfalls** to avoid
- **Success metrics** and measurement
- **Resource requirements**

### Future Directions (300-400 words):
- ## Future Outlook or ## Emerging Trends header
- Upcoming developments
- Research gaps
- Potential innovations
- Long-term implications

### Conclusion Section (400-500 words):
- ## Conclusion or ## Key Takeaways header
- **Comprehensive synthesis** of main points
- **5-8 detailed key takeaways** with explanations
- **Expert perspective** on the topic
- **Actionable next steps**
- **Closing insight** tying back to opening

### References Section:
<a name="ref1"></a>
**[1]** Source Title - [Link](URL)

## 4. QUALITY STANDARDS (NON-NEGOTIABLE):

### Writing Quality:
- **Professional yet accessible** - expert but not condescending
- **Thorough and analytical** - comprehensive but not verbose
- **Well-organized** with smooth transitions between sections
- **Active voice preferred** over passive
- **Specific over generic** - concrete examples and real data
- **Analytical over descriptive** - explain WHY and HOW, not just WHAT

### Formatting Quality:
- **Proper markdown syntax** - no errors
- **NO HTML tags** unless absolutely necessary
- **NO plain text paragraphs** - all text must have formatting
- **EVERY paragraph** needs **bold** or *italic* emphasis
- **Visual variety** - mix paragraphs, lists, tables, code, blockquotes
- **Consistent style** throughout document

### Content Quality:
- **Deep analysis** - beyond surface observations
- **Multiple perspectives** - different viewpoints when relevant
- **Evidence-based** - support claims with data
- **Practical relevance** - connect theory to reality
- **Current and accurate** - use recent information
- **Comprehensive coverage** - address from multiple angles

### Length Requirements (STRICTLY ENFORCED):
- **MINIMUM 8000 WORDS TOTAL** (target 8500-10000 for excellence)
- Introduction: 600-800 words
- Main sections: 6000-6500 words (across 8-12 sections)
- Analysis: 800-1000 words
- Practical Applications: 500-700 words
- Future Directions: 300-400 words
- Conclusion: 400-500 words
- **If under 8000 words, ADD MORE**: examples, case studies, deeper analysis, extended comparisons, more subsections

## 5. EXAMPLE STRUCTURE (FOLLOW THIS PATTERN):

\`\`\`markdown
# Comprehensive Analysis: [Specific, Descriptive Title with Context and Scope]

[2-3 compelling sentences explaining the scope, significance, and value of this research]

## 📋 Table of Contents
- [Executive Summary](#executive-summary)
- [Introduction](#introduction)  
- [Background & Historical Context](#background)
- [Core Concepts & Fundamentals](#core-concepts)
- [Detailed Technical Analysis](#technical-analysis)
- [Comparative Evaluation](#comparative-evaluation)
- [Real-World Applications & Case Studies](#applications)
- [Implementation Best Practices](#implementation)
- [Performance & Optimization](#performance)
- [Critical Analysis & Trade-offs](#analysis)
- [Future Directions & Emerging Trends](#future)
- [Conclusion & Key Takeaways](#conclusion)

## Executive Summary

[Comprehensive 3-4 paragraph summary of the entire research - 300-400 words covering key findings, main conclusions, and practical implications]

## Introduction

[Compelling opening with hook - statistic, question, or insight]

The landscape of [topic] has undergone **significant transformation** in recent years. This comprehensive analysis examines *[specific aspects]*, drawing on research from *multiple sources* and real-world implementations.

### Why This Matters

[2-3 paragraphs explaining current relevance and real-world impact - 200-300 words with specific examples]

### Scope of This Research

[Clear boundaries of what is and isn't covered - 150-200 words]

## Background & Historical Context

[Evolution of the topic with specific dates, milestones, and key developments - 600-800 words]

### Historical Development

[Trace evolution with timeline - 300-400 words with specific years and events]

### Current State

[Present landscape with recent statistics - 300-400 words with current data]

## Core Concepts & Fundamentals

### Concept 1: [Specific Concept Name]

[Detailed explanation - 400-500 words]

**Key Characteristics:**
- Characteristic 1 with detailed explanation and why it matters
- Characteristic 2 with specific examples and data
- Characteristic 3 with real-world implications

**Real-World Example:**

[Concrete example with specific organization, numbers, timeframes, outcomes - 100-150 words]

\`\`\`javascript
// Detailed code example with comprehensive comments
const implementationExample = {
  property1: 'value with context and explanation',
  property2: 42, // specific metric or configuration
  method: function() {
    // Implementation details with rationale
    return this.property2 * 1.5;
  }
};
\`\`\`

**Practical Implications:**

[What this means in practice and why developers/practitioners care - 100-150 words]

### Concept 2: [Another Specific Concept]

[Another detailed explanation - 400-500 words following same pattern]

**Comparative Analysis:**

| Feature | Approach A | Approach B | Approach C |
|---------|------------|------------|------------|
| Performance | 100ms avg | 150ms avg | 80ms avg |
| Scalability | Excellent (1M+ req/sec) | Good (500K req/sec) | Limited (100K req/sec) |
| Complexity | High (5-7 days setup) | Medium (2-3 days) | Low (1 day) |
| Cost | $500/month | $200/month | $50/month |

## Detailed Technical Analysis

[In-depth technical examination - 800-1000 words with multiple subsections and code examples]

### Architecture & Design Patterns

[Detailed analysis - 400-500 words]

### Performance Characteristics

[Benchmarks and metrics - 400-500 words with specific numbers]

## Critical Analysis & Trade-offs

[Comprehensive analysis synthesizing all findings - 800-1000 words]

### Strengths and Advantages

**Key Strengths:**
- **Strength 1**: [Detailed explanation with supporting evidence - 75-100 words]
- **Strength 2**: [Specific examples and metrics - 75-100 words]  
- **Strength 3**: [Expert perspectives and data - 75-100 words]

### Limitations and Challenges

**Primary Limitations:**
- **Limitation 1**: [Context, implications, and potential workarounds - 75-100 words]
- **Limitation 2**: [Real-world impact and considerations - 75-100 words]
- **Limitation 3**: [Future research directions - 75-100 words]

### Trade-off Analysis

[Detailed discussion of trade-offs in different scenarios - 300-400 words with specific examples]

## Practical Applications & Implementation

[Actionable guidance - 500-700 words]

### Implementation Roadmap

1. **Phase 1 - Foundation** [2-3 weeks]
   - Detailed step with requirements, timeframe, resources needed
   - Sub-steps with specific actions
   - Success criteria and checkpoints

2. **Phase 2 - Core Implementation** [4-6 weeks]
   - Next steps with dependencies
   - Technical requirements
   - Testing approach

3. **Phase 3 - Optimization** [2-3 weeks]
   - Final implementation details
   - Performance tuning
   - Production readiness

### Best Practices

[5-8 battle-tested best practices with detailed explanations - 200-300 words]

### Common Pitfalls

[Mistakes to avoid with explanations - 100-150 words]

## Future Directions & Emerging Trends

[Forward-looking analysis - 300-400 words]

[Discussion of upcoming innovations, research directions, and long-term implications]

## Conclusion & Key Takeaways

[Comprehensive synthesis bringing everything together - 400-500 words]

### Essential Takeaways

**Critical Insights:**
- ✅ **Takeaway 1**: [Comprehensive explanation connecting to research - 60-80 words]
- ✅ **Takeaway 2**: [Practical implications with specific guidance - 60-80 words]
- ✅ **Takeaway 3**: [Key insight with supporting evidence - 60-80 words]
- ✅ **Takeaway 4**: [Important consideration or recommendation - 60-80 words]
- ✅ **Takeaway 5**: [Future-looking perspective - 60-80 words]

### Final Perspective

[Closing thoughts connecting back to introduction and looking forward - 200-300 words with compelling final insight]
\`\`\`

## 6. FINAL QUALITY CHECKLIST (VERIFY BEFORE SUBMITTING):

✓ **MINIMUM 8000 WORDS** - Count honestly, no shortcuts
✓ **Compelling, descriptive # H1 title** as first line (not generic)
✓ **Table of Contents** for easy navigation
✓ **All markdown elements used extensively**: headers, bold, italic, code blocks, tables, blockquotes, lists, horizontal rules
✓ **8-12 major ## sections** with clear purpose
✓ **Each major section has 3-6 ### subsections** with substantial content
✓ **Natural language citations** - NO [1], [2] or (Author, Year) styles
✓ **10+ specific data points** throughout (percentages, numbers, dates)
✓ **5+ concrete examples or case studies** with real details
✓ **Multiple comparison tables** evaluating options
✓ **Visual hierarchy** crystal clear
✓ **Horizontal rules (---)** between major sections
✓ **3-5 code examples** for technical topics
✓ **Practical implementation guidance** with actionable steps
✓ **Analysis section** discussing implications
✓ **Future directions** section
✓ **Comprehensive conclusion** with 5-8 detailed takeaways
✓ **Every paragraph formatted** - no plain text
✓ **Smooth transitions** between sections
✓ **Professional yet accessible** tone

This is DEEP RESEARCH - users expect authoritative, exhaustive, expert-level analysis demonstrating true mastery. NOT a summary - a comprehensive deep dive providing exceptional value.

Respond with ONLY a JSON object:
{
  "response": "Your comprehensive 8000+ word markdown research report with prominent title and professional formatting",
  "citations": [
    {
      "id": "cite1",
      "source": "Descriptive source name",
      "author": "Author or organization",
      "year": "2024",
      "url": "https://source-url.com",
      "relevance": "Specific contribution of this source to the research"
    }
  ],
  "followUpQuestions": [
    "Thought-provoking question 1 exploring adjacent topics?",
    "Practical question 2 about implementation?",
    "Analytical question 3 about implications?",
    "Forward-looking question 4 about future developments?",
    "Strategic question 5 about optimal approaches?"
  ]
}`;

export async function formatterNode(
  state: ResearchState,
  config: { openaiApiKey: string; model: string; abortSignal?: AbortSignal }
): Promise<Partial<ResearchState>> {
  if (config.abortSignal?.aborted) {
    throw new Error('Research aborted by user');
  }
  const { originalQuery, aggregatedResults, completedTasks = [] } = state;

  let contentToFormat = aggregatedResults;
  
  if (!contentToFormat || contentToFormat === 'No research findings to aggregate.') {
    if (completedTasks.length > 0) {
      contentToFormat = completedTasks
        .map((task, index) => {
          if (task.status === 'failed') {
            return `## Question ${index + 1}: ${task.question}\n**Status:** Failed - ${task.error || 'Unknown error'}`;
          }
          return `## Question ${index + 1}: ${task.question}\n\n${task.result || 'No result'}`;
        })
        .join('\n\n---\n\n');
      
    } else {
      return {
        finalResponse: 'Unable to generate research response - no research data available. Please try again.',
        citations: [],
        followUpQuestions: [],
      };
    }
  }

  const llm = new ChatOpenAI({
    model: config.model,
    apiKey: config.openaiApiKey,
  });

  try {
    const response = await llm.invoke([
      { role: 'system', content: ENHANCED_FORMATTER_PROMPT },
      {
        role: 'user',
        content: `**Original Question:** ${originalQuery}\n\n**Research Findings:**\n${contentToFormat}\n\nCreate a comprehensive response with citations and follow-up questions.`,
      },
    ]);

    const content = response.content.toString();
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    
    if (!jsonMatch) {
      return {
        finalResponse: content,
        citations: extractCitationsFromText(content),
        followUpQuestions: [],
      };
    }

    let parsed;
    try {
      const jsonString = sanitizeJsonString(jsonMatch[0]);
      parsed = JSON.parse(jsonString);
    } catch (parseError: unknown) {
      if (parseError instanceof Error && parseError.message.includes('position')) {
        const posMatch = parseError.message.match(/position (\d+)/);
        if (posMatch) {
          const pos = parseInt(posMatch[1]);
          const start = Math.max(0, pos - 100);
          const end = Math.min(jsonMatch[0].length, pos + 100);
          const snippet = jsonMatch[0].substring(start, end);
          console.error('[Formatter] Error context:', JSON.stringify(snippet));
        }
      }
      
      try {
        const responseMatch = jsonMatch[0].match(/"response"\s*:\s*"((?:[^"\\]|\\.)*)"/s);
        if (responseMatch) {
          const extractedResponse = responseMatch[1]
            .replace(/\\n/g, '\n')
            .replace(/\\t/g, '\t')
            .replace(/\\"/g, '"')
            .replace(/\\\\/g, '\\');
          return {
            finalResponse: extractedResponse,
            citations: extractCitationsFromText(extractedResponse),
            followUpQuestions: [],
          };
        }
      } catch (extractError) {
        console.error('[Formatter] Extraction also failed:', extractError);
      }
      
      return {
        finalResponse: content,
        citations: extractCitationsFromText(content),
        followUpQuestions: [],
      };
    }

    const finalResponse = parsed.response || content;
    const citations: Citation[] = parsed.citations || [];
    const followUpQuestions: string[] = parsed.followUpQuestions || [];

    if (citations.length === 0 && state.completedTasks) {
      const taskSources = state.completedTasks
        .flatMap((task) => task.sources || [])
        .filter((source, index, self) => 
          index === self.findIndex((s) => s.url === source.url)
        );

      citations.push(...taskSources.map((source, index) => ({
        id: `cite${index + 1}`,
        source: source.title,
        author: source.title.split(/[-|:]|by/i)[0]?.trim() || 'Unknown',
        year: new Date().getFullYear().toString(),
        url: source.url,
        relevance: 'Source used in research',
      })));
    }

    return {
      finalResponse,
      citations,
      followUpQuestions,
    };

  } catch (error) {
    console.error('[Formatter Node] ❌ Error:', error);
    return {
      finalResponse: contentToFormat || 'Error generating research response.',
      citations: extractCitationsFromText(contentToFormat || ''),
      followUpQuestions: [],
    };
  }
}

function extractCitationsFromText(text: string): Citation[] {
  const citations: Citation[] = [];
  
  const citationPattern = /\(([^,]+),\s*(\d{4})\)|\[([^,]+)\s+(\d{4})\]/g;
  let match;
  let id = 1;

  while ((match = citationPattern.exec(text)) !== null) {
    const author = match[1] || match[3];
    const year = match[2] || match[4];
    
    if (author && year) {
      citations.push({
        id: `cite${id++}`,
        source: `${author} (${year})`,
        author,
        year,
        relevance: 'Cited in text',
      });
    }
  }

  return citations;
}
