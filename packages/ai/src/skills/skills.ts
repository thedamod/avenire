// This file is generated. Do not edit by hand.
// Run: pnpm --filter @avenire/ai skills:generate

export type SkillSection = "study-guidelines" | "tool-guidelines" | "visual-guidelines";

export interface SkillDefinition {
  readonly id: string;
  readonly title: string;
  readonly description: string | null;
  readonly section: SkillSection;
  readonly path: string;
  readonly content: string;
}

export const SKILL_MAP = {
  "concept-explainer": {
    id: "concept-explainer",
    title: "Concept Explainer",
    description: "ELI5-style explanations with analogies and multiple examples. Explains concepts at different levels (ELI5, high school, undergraduate, graduate). Uses real-world analogies and visual metaphors. Use when explaining difficult concepts, clarifying confusing topics, or learning new subjects. Triggers - explain concept, ELI5, explain like I'm 5, what is, how does, why does, analogy for, simple explanation.",
    section: "study-guidelines",
    path: "sections/study-guidelines/concept-explainer.md",
    content: `---
name: concept-explainer
description: ELI5-style explanations with analogies and multiple examples. Explains concepts at different levels (ELI5, high school, undergraduate, graduate). Uses real-world analogies and visual metaphors. Use when explaining difficult concepts, clarifying confusing topics, or learning new subjects. Triggers - explain concept, ELI5, explain like I'm 5, what is, how does, why does, analogy for, simple explanation.
---

# Concept Explainer

Clear explanations with analogies and examples at multiple difficulty levels.

## Explanation Levels

| Level         | Audience               | Style                                 |
| ------------- | ---------------------- | ------------------------------------- |
| ELI5          | Complete beginner      | Simple words, everyday analogies      |
| High School   | Some background        | Basic terminology, clear examples     |
| Undergraduate | Foundational knowledge | Technical terms, detailed mechanisms  |
| Graduate      | Advanced understanding | Nuances, edge cases, research context |

---

## Explanation Framework

\`\`\`mermaid
flowchart TB
    A[Concept] --> B[One-Sentence Summary]
    B --> C[Core Analogy]
    C --> D[How It Works]
    D --> E[Examples]
    E --> F[Common Misconceptions]
\`\`\`

---

## Template: Standard Explanation

\`\`\`markdown
# [Concept Name]

## In One Sentence

[Concept] is [simple definition] that [what it does/why it matters].

## The Analogy

Think of [concept] like [familiar thing]. Just as [familiar thing does X], [concept] does [Y].

## How It Actually Works

[More detailed explanation with proper terminology]

### Key Components

1. **Component 1:** What it is and what it does
2. **Component 2:** What it is and what it does
3. **Component 3:** How they work together

## Examples

### Example 1: [Simple]

[Everyday example with the concept]

### Example 2: [Applied]

[Real-world application]

### Example 3: [Advanced]

[Complex scenario]

## Common Misconceptions

- ❌ **Myth:** [Wrong belief]
  - ✅ **Reality:** [Correct understanding]

## Related Concepts

- [Concept A] - [How it relates]
- [Concept B] - [How it relates]
\`\`\`

---

## Analogy Patterns

### Structure Analogy

"[Concept] is like a [familiar object] where [component A] is like [part 1] and [component B] is like [part 2]."

**Example:** "A cell is like a factory where the nucleus is the control room and mitochondria are the power plants."

### Process Analogy

"[Concept] works like [familiar process]. First, [step 1 comparison], then [step 2 comparison]."

**Example:** "Osmosis works like crowds at a concert. People naturally spread from crowded areas to less crowded areas."

### Scale Analogy

"If [large/small thing] were the size of [familiar object], then [other element] would be..."

**Example:** "If an atom were the size of a football stadium, the nucleus would be a marble at the center."

---

## Level Adjustments

### ELI5 Techniques

- No jargon
- 1-2 sentence explanations
- Everyday objects as analogies
- "Imagine if..." scenarios
- Avoid numbers unless simple

### High School Level

- Introduce key terms with definitions
- Simple diagrams
- Concrete examples
- Cause and effect clear

### Undergraduate Level

- Technical vocabulary expected
- Mathematical relationships
- Mechanism details
- Multiple interconnected concepts

### Graduate Level

- Assumptions and limitations
- Historical development
- Current research questions
- Edge cases and exceptions

---

## Example: Explaining "Entropy" at Multiple Levels

### ELI5

"Entropy is messiness. Your room wants to get messy by itself, but you have to work to clean it up."

### High School

"Entropy measures disorder in a system. In nature, things tend to become more disordered over time - ice melts, buildings crumble, things mix together."

### Undergraduate

"Entropy (S) is a thermodynamic quantity measuring the number of microscopic configurations (microstates) available to a system. ΔS = Q/T for reversible processes. The Second Law states entropy of an isolated system never decreases."

### Graduate

"Entropy connects to information theory through Boltzmann's equation S = k ln Ω. Maximum entropy methods provide principled uncertainty quantification. Non-equilibrium thermodynamics extends these concepts to systems with entropy production."

---

## Quality Checklist

- [ ] Opens with simple one-liner
- [ ] Includes relatable analogy
- [ ] Provides 2-3 examples at different scales
- [ ] Addresses common misconceptions
- [ ] Builds from simple to complex
- [ ] Uses consistent terminology
- [ ] Connects to related concepts
- [ ] Any equations are written inline with \`$...$\` or display with \`$$...$$\`, never fenced as \`\`\`latex
`,
  },
  "flashcard-generator": {
    id: "flashcard-generator",
    title: "Flashcard Creator",
    description: "Create flashcards for spaced repetition learning using concise markdown front/back cards with optional notes and source citations. Use when creating study flashcards, vocabulary cards, memorization aids, or spaced repetition materials from notes or topics. Triggers - create flashcards, make flashcards, spaced repetition, memory cards, study cards.",
    section: "study-guidelines",
    path: "sections/study-guidelines/flashcard-generator.md",
    content: `---
name: flashcard-generator
description: Create flashcards for spaced repetition learning using concise markdown front/back cards with optional notes and source citations. Use when creating study flashcards, vocabulary cards, memorization aids, or spaced repetition materials from notes or topics. Triggers - create flashcards, make flashcards, spaced repetition, memory cards, study cards.
---

# Flashcard Creator

Generate effective flashcards optimized for spaced repetition learning.

Avenire is not a flashcard app: cards are a by-product of studying, written by Ruth Cloud
as an artifact file. Write them as a JSON array of
\`{ "front": string, "back": string, "notes"?: string, "sourceItemIds": string[] }\`, with
markdown allowed in \`front\`, \`back\` and \`notes\`. Every card cites the items it came from.

## Workflow

\`\`\`mermaid
flowchart LR
    A[Source Material] --> B[Identify Key Facts]
    B --> C[Choose Card Type]
    C --> D[Create Cards]
    D --> E[Add Mnemonics]
    E --> F[Write the JSON artifact]
\`\`\`

---

## Step 1: Card Design Principles

### The 20 Rules of Formulating Knowledge (Summary)

1. **Understand before memorizing** - Never create cards for things you don't understand
2. **Minimum information** - Keep each card focused on ONE fact
3. **Use cloze deletion** - More effective than Q&A for many concepts
4. **Avoid sets/lists** - Break lists into individual cards or use mnemonics
5. **Use imagery** - Visual memory is powerful
6. **Use mnemonic techniques** - Acronyms, stories, memory palaces

---

## Step 2: Card Types

### Basic Card (Front → Back)

\`\`\`
Front: What is the powerhouse of the cell?
Back: Mitochondria
\`\`\`

### Reversed Card (Both Directions)

\`\`\`
Front: Mitochondria
Back: The powerhouse of the cell - produces ATP through cellular respiration
\`\`\`

### Cloze Deletion

\`\`\`
Text: The {{c1::mitochondria}} is the powerhouse of the cell, producing {{c2::ATP}}.
\`\`\`

Use cloze-like prompts sparingly and only when a deletion-style cue is clearly better than a standard question/answer card. Prefer straightforward prompts when possible.

---

## Step 3: Card Templates by Subject

### Vocabulary/Terminology

\`\`\`
Front: [Term]
Back:
- Definition: [Clear definition]
- Example: [Usage in context]
- Related: [Connected terms]
\`\`\`

### Formulas

\`\`\`
Front: Formula for [concept]?
Back:
[Formula]
Where:
- [Variable] = [meaning]
\`\`\`

### Processes/Sequences

\`\`\`
Front: What are the steps of [process]?
Back:
1. [Step 1]
2. [Step 2]
3. [Step 3]
Mnemonic: [Memory aid]
\`\`\`

### Dates/Events

\`\`\`
Front: [Year]: What happened?
Back: [Event and significance]
\`\`\`

OR

\`\`\`
Front: When did [event] occur?
Back: [Year] - [Brief context]
\`\`\`

---

## Step 4: Mnemonic Techniques

### Acronyms

\`\`\`
Front: Order of operations in math?
Back: PEMDAS - Parentheses, Exponents, Multiplication, Division, Addition, Subtraction
\`\`\`

### Visual Association

\`\`\`
Front: What is the symbol for Iron on the periodic table?
Back: Fe (think: "Fe"rris wheel made of iron)
\`\`\`

### Story Method

\`\`\`
Front: Stages of mitosis in order?
Back: PMAT - "Please Make Another Taco"
Prophase → Metaphase → Anaphase → Telophase
\`\`\`

---

## Step 5: Output Format

Each card is one object in the artifact's JSON array:

\`\`\`json
{
  "front": "What is DNA?",
  "back": "Deoxyribonucleic acid - carries genetic information.",
  "notes": "Think \\"de-oxy-ribo\\" for the sugar backbone.",
  "sourceItemIds": ["itm_..."]
}
\`\`\`

### Markdown guidance

- Keep \`front\` short and testable.
- Keep \`back\` concise, but complete enough to stand alone.
- Put memory hooks, mnemonics, or one small example in \`notes\` instead of bloating the answer.
- Use bullets in \`back\` only when the answer genuinely needs a short list.

---

## Step 6: Batch Generation Template

When creating multiple cards from a topic:

\`\`\`\`markdown
# [Topic] Flashcards

**Total Cards:** [Number]
**Deck Name:** [Subject]::[Topic]
**Tags:** [tag1] [tag2]

---

## Cards

### Card 1

**Front:** [Question/Prompt]
**Back:** [Answer/Information]

### Card 2

**Front:** [Question/Prompt]
**Back:** [Answer/Information]

[Continue...]

---

## Quality Checklist

- [ ] Each card tests ONE piece of information
- [ ] Cards can be answered in <10 seconds
- [ ] No ambiguous questions with multiple valid answers
- [ ] Mnemonics added for difficult items
- [ ] Cards are context-independent (understandable alone)
- [ ] Cloze deletions used where appropriate
- [ ] Every card cites at least one source item
- [ ] Any equations use \`$...$\` or \`$$...$$\` formatting, never \`\`\`latex fences
\`\`\`\`
`,
  },
  "quiz-creator": {
    id: "quiz-creator",
    title: "[Topic] Quiz",
    description: null,
    section: "study-guidelines",
    path: "sections/study-guidelines/quiz-creator.md",
    content: `---

## Step 2: Question Type Templates

### Multiple Choice (MCQ)

\`\`\`markdown
**Q1.** [Question stem]

A) [Distractor - common misconception]
B) [Distractor - partially correct]
C) [Correct answer]
D) [Distractor - related but wrong]

<details>
<summary>Answer</summary>
C) [Explanation why correct and why others are wrong]
</details>
\`\`\`

**Best for:** Definitions, facts, identifying correct procedures

### True/False

\`\`\`markdown
**Q2.** [Statement to evaluate] _(True/False)_

<details>
<summary>Answer</summary>
**False** - [Explanation of the correct information]
</details>
\`\`\`

**Best for:** Common misconceptions, verifying understanding

### Fill-in-the-Blank

\`\`\`markdown
**Q3.** The process of ________ converts glucose into ATP through ________.

<details>
<summary>Answer</summary>
**cellular respiration**, **oxidative phosphorylation**
</details>
\`\`\`

**Best for:** Terminology, formulas, key vocabulary

### Short Answer

\`\`\`markdown
**Q4.** Explain the relationship between [concept A] and [concept B].

<details>
<summary>Answer</summary>
[Model answer with key points that should be mentioned]

**Key points to include:**
- Point 1
- Point 2
- Point 3
</details>
\`\`\`

**Best for:** Conceptual understanding, explanations, analysis

### Matching

\`\`\`markdown
**Q5.** Match each term with its definition:

| Term | Definition |
|------|------------|
| 1. [Term A] | A. [Definition 3] |
| 2. [Term B] | B. [Definition 1] |
| 3. [Term C] | C. [Definition 2] |

<details>
<summary>Answer</summary>
1-B, 2-C, 3-A
</details>
\`\`\`

**Best for:** Vocabulary, pairing concepts, classifications

---

## Step 3: Difficulty Levels

| Level      | Characteristics                   | Bloom's Level    |
| ---------- | --------------------------------- | ---------------- |
| **Easy**   | Direct recall, single concept     | Remember         |
| **Medium** | Application, 2+ concepts combined | Understand/Apply |
| **Hard**   | Analysis, synthesis, edge cases   | Analyze/Evaluate |

### Difficulty Distribution Recommendation

- **Review quiz:** 60% Easy, 30% Medium, 10% Hard
- **Practice test:** 30% Easy, 50% Medium, 20% Hard
- **Challenge quiz:** 10% Easy, 40% Medium, 50% Hard

---

## Step 4: Quiz Structure Template

\`\`\`markdown
# [Topic] Quiz

**Subject:** [Subject Name]
**Difficulty:** [Easy/Medium/Hard/Mixed]
**Questions:** [Number]
**Time:** [Suggested minutes]

---

## Section A: Multiple Choice (X points)

[MCQ questions]

## Section B: True/False (X points)

[T/F questions]

## Section C: Short Answer (X points)

[Short answer questions]

---

## Answer Key

[All answers with explanations]

---

_Generated from: [Source material reference]_
\`\`\`

---

## Step 5: Quality Checklist

- [ ] Questions test understanding, not just memorization
- [ ] MCQ distractors are plausible (not obviously wrong)
- [ ] Difficulty is appropriate for stated level
- [ ] Answer explanations clarify misconceptions
- [ ] Questions cover breadth of source material
- [ ] No ambiguous wording or trick questions
- [ ] Formulas and equations are rendered inline with \`$...$\` or display with \`$$...$$\`, never fenced as \`\`\`latex
`,
  },
  "study-notes-creator": {
    id: "study-notes-creator",
    title: "Study Notes Creator",
    description: "Create organized, visual study notes with folder structures, diagrams, and example-based learning from source materials (PDFs, lecture notes, documentation). Use when creating structured learning materials, exam preparation notes, or educational documentation. Triggers - organize study notes, create visual learning materials, generate notes with diagrams, exam prep notes, example-based learning.",
    section: "study-guidelines",
    path: "sections/study-guidelines/study-notes-creator.md",
    content: `---
name: study-notes-creator
description: Create organized, visual study notes with folder structures, diagrams, and example-based learning from source materials (PDFs, lecture notes, documentation). Use when creating structured learning materials, exam preparation notes, or educational documentation. Triggers - organize study notes, create visual learning materials, generate notes with diagrams, exam prep notes, example-based learning.
---

# Study Notes Creator

Transform source materials into organized, visual study notes with themed folders, rich diagrams, and example-based learning.

## Workflow

\`\`\`mermaid
flowchart LR
    A[Source Materials] --> B[Extract Topics]
    B --> C[Plan Structure]
    C --> D[Create Notes]
    D --> E[Add Diagrams + Examples]
    E --> F[Build Index]
\`\`\`

When notes include equations, keep them in normal markdown with \`$...$\` or \`$$...$$\`. Never use fenced \`\`\`latex blocks.

---

## Step 1: Understand the Source

1. **Read the source** - PDFs, lecture notes, existing docs
2. **Identify 5-8 main topics** - Major themes
3. **Find subtopics** - What falls under each theme?
4. **Note example opportunities** - Where can real examples help?

---

## Step 2: Plan Folder Structure

\`\`\`
subject/
├── README.md                    # Master index
├── concepts/                    # Core theory
│   ├── 01-introduction.md
│   └── 02-fundamentals.md
├── techniques/                  # How-to procedures
│   ├── 01-method-a.md
│   └── 02-method-b.md
├── examples/                    # Worked problems
│   ├── 01-basic-examples.md
│   └── 02-advanced-examples.md
└── practice/                    # Exercises
    └── 01-exercises.md
\`\`\`

---

## Step 3: Note Template

\`\`\`markdown
# [Topic Title]

One sentence summary.

## Overview

[Mermaid diagram showing the main concept]

## Key Concepts

### Concept 1

Brief explanation.

**Example:**
[Concrete example with real-world scenario]

## Summary Table

| Term | Definition | Example       |
| ---- | ---------- | ------------- |
| A    | What A is  | Real use case |

## Practice Problems

1. Problem statement
   <details>
   <summary>Solution</summary>
   Step-by-step solution
   </details>

## Related

- [[other-note]] - Connection
\`\`\`

---

## Step 4: Mermaid Diagrams (Primary)

### Flowchart (Process Flow)

\`\`\`mermaid
flowchart LR
    A[Start] --> B[Process]
    B --> C{Decision}
    C -->|Yes| D[Action]
    C -->|No| E[End]
\`\`\`

**Use for:** Processes, decision trees, algorithms, workflows

### Flowchart TB (Hierarchy/Tree)

\`\`\`mermaid
flowchart TB
    A[Main Topic] --> B[Branch A]
    A --> C[Branch B]
    A --> D[Branch C]
    B --> E[Detail 1]
    B --> F[Detail 2]
    C --> G[Detail 3]
\`\`\`

**Use for:** Taxonomies, classifications, org charts, topic breakdowns

### Sequence Diagram

\`\`\`mermaid
sequenceDiagram
    participant A as Actor
    participant S as System
    A->>S: Request
    S-->>A: Response
    A->>S: Follow-up
\`\`\`

**Use for:** Interactions, conversations, API calls, cause-effect chains

### State Diagram

\`\`\`mermaid
stateDiagram-v2
    [*] --> Idle
    Idle --> Active : Start
    Active --> Success : Complete
    Active --> Error : Fail
    Error --> Idle : Retry
    Success --> [*]
\`\`\`

**Use for:** Lifecycles, status changes, phases, state machines

### Cycle Diagram

\`\`\`mermaid
flowchart LR
    A[Stage 1] --> B[Stage 2]
    B --> C[Stage 3]
    C --> D[Stage 4]
    D --> A
\`\`\`

**Use for:** Water cycle, feedback loops, iterative processes, life cycles

### Timeline

\`\`\`mermaid
timeline
    title Historical Events
    1800 : Event A
    1850 : Event B
    1900 : Event C
    1950 : Event D
\`\`\`

**Use for:** Historical timelines, project phases, evolution of concepts

### Mind Map

\`\`\`mermaid
mindmap
  root((Topic))
    Branch A
      Detail 1
      Detail 2
    Branch B
      Detail 3
      Detail 4
\`\`\`

**Use for:** Brainstorming, topic overviews, concept relationships

---

## Step 5: ASCII Diagrams (Edge Cases)

Use ASCII only for:

- **Overview boxes** with custom text layout
- **Layer/stack diagrams**
- **Comparison layouts**

### Overview Box

\`\`\`
┌─────────────────────────────────────────────────────────────────────────────┐
│                              TOPIC TITLE                                    │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Key Point 1    Key Point 2    Key Point 3                                  │
│      │              │              │                                        │
│  [details]      [details]      [details]                                    │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
\`\`\`

### Layers/Stack

\`\`\`
┌─────────────────────────────────────────────────────────────────────────────┐
│                              Layer 4 (Top)                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                              Layer 3                                        │
├─────────────────────────────────────────────────────────────────────────────┤
│                              Layer 2                                        │
├─────────────────────────────────────────────────────────────────────────────┤
│                              Layer 1 (Bottom)                               │
└─────────────────────────────────────────────────────────────────────────────┘
\`\`\`

### Box Characters Reference

\`\`\`
Corners: ┌ ┐ └ ┘   Lines: ─ │   T-joints: ├ ┤ ┬ ┴   Arrows: ▶ ▼ ◀ ▲
\`\`\`

---

## Step 6: Example-Based Learning Patterns

### Pattern 1: Concept → Example → Variation

\`\`\`markdown
## [Concept Name]

**Definition:** Brief explanation.

**Example:**
[Concrete, real-world scenario]

**Variation:**
What if [different condition]? → [Different outcome]
\`\`\`

**Cross-discipline examples:**

| Subject   | Concept       | Example                                   | Variation                         |
| --------- | ------------- | ----------------------------------------- | --------------------------------- |
| Biology   | Osmosis       | Red blood cells in salt water shrink      | In pure water? → Cells swell      |
| Economics | Supply/Demand | Oil price rises when OPEC cuts production | New oil discovered? → Price falls |
| Physics   | Momentum      | Bowling ball vs tennis ball at same speed | Same mass, different speed?       |
| History   | Cause/Effect  | Industrial Revolution → urbanization      | No steam engine?                  |

### Pattern 2: Problem → Solution → Explanation

\`\`\`markdown
**Problem:** [Specific question]

**Solution:**
Step 1: [Action]
Step 2: [Action]
Result: [Answer]

**Why it works:** [Underlying principle]
\`\`\`

### Pattern 3: Compare and Contrast

| Aspect    | Topic A | Topic B |
| --------- | ------- | ------- |
| Feature 1 | ...     | ...     |
| Feature 2 | ...     | ...     |

**Similarities:** Both...
**Key Difference:** A is... while B is...

---

## Step 7: Build the Index

\`\`\`markdown
# [Subject Name]

Brief description.

## Quick Navigation

### 📚 Core Concepts

- [[concepts/01-topic|Topic Name]] - Brief description

### 🔧 Techniques/Methods

- [[techniques/01-method|Method Name]] - Brief description

### 💡 Examples

- [[examples/01-basic|Basic Examples]] - Start here

---

_Last updated: YYYY-MM-DD_
\`\`\`

---

## Quality Checklist

- [ ] Every note has at least 1 Mermaid diagram
- [ ] Every concept has at least 1 concrete example
- [ ] Examples use real, relatable scenarios
- [ ] Folder structure is numbered for reading order
- [ ] README links to all notes
- [ ] Wikilinks connect related topics
`,
  },
  "summary-generator": {
    id: "summary-generator",
    title: "Summary Generator",
    description: "Condense lengthy materials into digestible summaries. Creates bullet-point summaries, Cornell notes, and cheat sheets with key terms highlighted. Use when summarizing textbooks, lectures, articles, or any study material. Triggers - summarize, create summary, condense notes, key points, cheat sheet, quick summary, TL;DR.",
    section: "study-guidelines",
    path: "sections/study-guidelines/summary-generator.md",
    content: `---
name: summary-generator
description: Condense lengthy materials into digestible summaries. Creates bullet-point summaries, Cornell notes, and cheat sheets with key terms highlighted. Use when summarizing textbooks, lectures, articles, or any study material. Triggers - summarize, create summary, condense notes, key points, cheat sheet, quick summary, TL;DR.
---

# Summary Generator

Transform lengthy content into concise, study-ready summaries.

## Workflow

\`\`\`mermaid
flowchart LR
    A[Source Material] --> B[Identify Key Points]
    B --> C[Choose Format]
    C --> D[Generate Summary]
    D --> E[Highlight Terms]
\`\`\`

---

## Summary Formats

### 1. Bullet Point Summary

**Best for:** Quick reference, revision

\`\`\`markdown
# [Topic] Summary

## Main Ideas

- **Key point 1:** Brief explanation
- **Key point 2:** Brief explanation
- **Key point 3:** Brief explanation

## Important Details

- Supporting fact 1
- Supporting fact 2

## Key Terms

- **Term 1:** Definition
- **Term 2:** Definition
\`\`\`

### 2. Cornell Notes Format

\`\`\`markdown
┌─────────────────────────────────────────────────────────────────┐
│ [Topic Title] │
├────────────────┬────────────────────────────────────────────────┤
│ │ │
│ Cue Column │ Notes Column │
│ (Questions) │ (Main content) │
│ │ │
│ What is X? │ • X is defined as... │
│ │ • Key characteristics: │
│ │ - Point 1 │
│ │ - Point 2 │
│ │ │
│ Why does Y? │ • Y happens because... │
│ │ • Related to Z through... │
│ │ │
├────────────────┴────────────────────────────────────────────────┤
│ Summary │
│ 2-3 sentence summary of the entire topic. │
└─────────────────────────────────────────────────────────────────┘
\`\`\`

### 3. One-Page Cheat Sheet

\`\`\`markdown
# [Subject] Cheat Sheet

## Section 1: [Topic]

| Concept | Key Info |
| ------- | -------- |
| A       | ...      |
| B       | ...      |

## Section 2: [Topic]

**Formula:** [equation]
**Steps:** 1 → 2 → 3

## Quick Reference

- **If X:** Do Y
- **If Z:** Do W
\`\`\`

---

## Summary Length Guidelines

| Original Length | Summary Target |
| --------------- | -------------- |
| 1 page          | 3-5 bullets    |
| 5 pages         | 1/2 page       |
| Chapter         | 1 page         |
| Textbook        | 5-10 pages     |

**Rule of thumb:** 20% of original length

---

## Key Extraction Process

1. **Read once** for overall understanding
2. **Identify main ideas** (usually 1 per paragraph/section)
3. **Find supporting evidence** (examples, data, explanations)
4. **Note key terms** and their definitions
5. **Connect concepts** with relationships

### What to Include

- Main arguments/thesis
- Key facts and figures
- Important definitions
- Cause-effect relationships
- Examples that clarify concepts

### What to Exclude

- Redundant information
- Excessive examples
- Background context (unless essential)
- Transitional phrases
- Author's tangents

---

## Highlighting Patterns

Use consistent formatting:

- **Bold** for key terms
- _Italics_ for emphasis
- \`Code\` for formulas/technical terms
- CAPS for acronyms
- → for cause-effect

---

## Quality Checklist

- [ ] Captures all main ideas
- [ ] Maintains logical structure
- [ ] Uses own words (not copy-paste)
- [ ] Key terms are highlighted
- [ ] Readable without original source
- [ ] Appropriate length for purpose
- [ ] Any math is written with \`$...$\` or \`$$...$$\`, not \`\`\`latex fences
`,
  },
  "python": {
    id: "python",
    title: "Python",
    description: "Use run_python for real computation - brute force, statistics, symbolic math, data processing over the user's material. Load before the first run_python call.",
    section: "tool-guidelines",
    path: "sections/tool-guidelines/python.md",
    content: `---
name: python
description: Use run_python for real computation - brute force, statistics, symbolic math, data processing over the user's material. Load before the first run_python call.
---

# Python

\`run_python\` runs your code once in a fresh sandbox and throws it away. Nothing persists
between calls: re-send any data the next call needs.

## When

- Brute force: enumeration, Monte Carlo, parameter sweeps, numerical solutions.
- Statistics or data processing over numbers from the user's material.
- Symbolic math you want checked (sympy).

Not for: drawing interactive visuals (write an \`<avenire-sim>\`), or answers you can give
exactly in prose.

## How

- numpy, scipy, pandas, sympy, matplotlib are preinstalled; ask for others with \`packages\`.
- Seed every random generator so results are reproducible.
- Print the numbers you will quote; keep stdout short and labelled.
- Matplotlib figures are saved and returned as figures. Use them for static results only;
  if the learner should explore the result, print the data and show it as an
  \`<avenire-chart>\` or feed it to a simulation.
- If a result has a parameter worth exploring, compute a small grid over it once, rather
  than planning to re-run Python per value.
- When it fails, read the error, fix the code and try once more; then explain.
`,
  },
  "chart": {
    id: "chart",
    title: "Chart",
    description: "Write an <avenire-chart> - a declarative, Vega-Lite-shaped chart spec rendered natively with tooltips, legend toggles, brushing and filters. Use for large amounts of raw information.",
    section: "visual-guidelines",
    path: "sections/visual-guidelines/chart.md",
    content: `---
name: chart
description: Write an <avenire-chart> - a declarative, Vega-Lite-shaped chart spec rendered natively with tooltips, legend toggles, brushing and filters. Use for large amounts of raw information.
---

# Chart

A chart is a JSON spec inside \`<avenire-chart>\`. The renderer adds the interactions
itself (crosshair tooltip, legend toggle, brush-to-zoom, filter chips, data table, copy
data), so the spec only describes the data and the encoding. No code.

\`\`\`html
<avenire-chart id="vis-co2" title="CO₂ and temperature, 1900–2020">
  { "mark": "line", "data": { "values": [{ "year": 1900, "co2": 296, "temp": -0.08 }] }, "encoding":
  { "x": { "field": "year", "type": "temporal" }, "y": { "field": "co2", "type": "quantitative",
  "title": "CO₂ (ppm)" } }, "interactions": { "brush": "x" } }
</avenire-chart>
\`\`\`

## Spec

- \`mark\`: \`bar\` | \`line\` | \`area\` | \`point\` | \`rule\` | \`arc\` | \`boxplot\` | \`heatmap\` |
  \`histogram\` | \`candlestick\`.
- \`encoding\`: \`x\`, \`y\`, \`color\`, \`size\`, \`facet\`, each \`{ field, type, aggregate?, title? }\`
  where \`type\` is \`quantitative\` | \`temporal\` | \`ordinal\` | \`nominal\`.
- \`transform\` (optional): \`filter\`, \`aggregate\`, \`bin\`, \`window\`.
- \`data\`: \`{ "values": [...] }\` inline rows, or \`{ "dataRef": "<run_python data name>" }\`.
- \`layer\` (optional): an array of \`{ mark, encoding }\` for overlays, e.g. a second axis.
- \`interactions\` (optional hints): \`{ "brush": "x" | "xy", "filter": "<field>" }\`.

## Rules

- Values must come from the user's material or a \`run_python\` result. Never invent data.
- Pick the simplest mark that shows the shape: bar for comparison, line for trend,
  point for relationship, histogram/boxplot for distribution.
- At most 5 series, and only use colour when it encodes something.
- Title axes with units. Put the takeaway in your prose, not in the chart.
`,
  },
  "simulation": {
    id: "simulation",
    title: "Simulation",
    description: "Write an <avenire-sim> - an interactive simulation whose model runs in a worker on top of the Avenire viz kits. Use when many moving parts together determine the outcome.",
    section: "visual-guidelines",
    path: "sections/visual-guidelines/simulation.md",
    content: `---
name: simulation
description: Write an <avenire-sim> - an interactive simulation whose model runs in a worker on top of the Avenire viz kits. Use when many moving parts together determine the outcome.
---

# Simulation

A simulation is an HTML widget inside your markdown. Its model and drawing run in a Web
Worker on an \`OffscreenCanvas\`; the HTML around it is only layout, labels and readouts.

\`\`\`html
<avenire-sim id="vis-arm" kit="kinematics" title="Reaching a target">
  <script type="avenire/params">
    { "segments": { "min": 2, "max": 6, "step": 1, "default": 3, "label": "Segments" },
      "jointLimitDeg": { "min": 10, "max": 180, "default": 120, "label": "Joint limit" } }
  </script>
  <script type="avenire/worker">
    export function setup(ctx) {
      const { fabrik2 } = ctx.kits.kinematics;
      let chain = fabrik2.chain(ctx.params.segments, 80);
      const target = ctx.handles.point({ x: 200, y: 0 });
      ctx.loop(() => {
        const result = chain.solve(target, { jointLimitDeg: ctx.params.jointLimitDeg });
        ctx.plot.clear();
        ctx.plot.chain(chain);
        ctx.emit("reachable", result.reachable ? "yes" : "no");
      });
    }
  </script>
  <p>Reachable: <strong data-readout="reachable"></strong></p>
</avenire-sim>
\`\`\`

## The worker API (\`setup(ctx)\`)

- \`ctx.canvas\`: the \`OffscreenCanvas\` (2D or WebGL).
- \`ctx.params\`: live parameter values, declared in \`avenire/params\` (number ranges,
  booleans, selects). The host renders the controls.
- \`ctx.loop(fn)\`: the frame loop; paused offscreen and under reduced motion.
- \`ctx.pointer\`, \`ctx.handles.point(...)\`: input forwarded from the page, draggable points.
- \`ctx.theme\`: theme tokens from \`get_page_context\`.
- \`ctx.data(name)\`: a \`run_python\` data output or precomputed grid.
- \`ctx.emit(name, value)\`: updates elements with \`data-readout="name"\`.
- \`ctx.kits\`: only the kits \`get_page_context\` lists, e.g. \`kinematics\` (FABRIK chains,
  joint limits), \`mechanics\` (springs, XPBD, RK4), \`fields\`, \`geometry\`, \`stochastic\`
  (seeded RNG, samplers), \`systems\` (SIR, stock/flow), \`plot\`, \`signals\`.

## Rules

- At least two parameters that interact, or a draggable state. Otherwise use a chart.
- No network, no DOM access from worker code, no \`fetch\`, no external scripts.
- Stay within the frame budget from \`get_page_context\`; precompute what doesn't change.
- Seed randomness so a re-run shows the same thing.
- Simulations aren't only physics: epidemics, markets, Bayesian updating and algorithms
  are simulations too.
`,
  },
  "visuals": {
    id: "visuals",
    title: "Visuals",
    description: "Choose how to show a concept - text, chart, simulation or video - and how to write inline visuals. Load before writing any <avenire-chart> or <avenire-sim>.",
    section: "visual-guidelines",
    path: "sections/visual-guidelines/visuals.md",
    content: `---
name: visuals
description: Choose how to show a concept - text, chart, simulation or video - and how to write inline visuals. Load before writing any <avenire-chart> or <avenire-sim>.
---

# Visuals

A visual is a teaching decision. Pick the modality from what the learner needs to do
with the idea: compare, follow, compute or manipulate. Prose always wraps the visual: a
one-line objective before it, and the takeaway after it.

## Pick the modality

| The concept is…                                                                                                                                      | Use                                                                                      |
| ---------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| A single formula, definition, small table or comparison                                                                                              | **Text**: markdown + \`$...$\` math                                                        |
| A lot of raw information: values, categories, time series, distributions                                                                             | **Chart**: \`<avenire-chart>\`, load \`chart\`                                               |
| Heavily mathematical, needs brute force (Monte Carlo, sweeps, numerics, statistics)                                                                  | Compute with \`run_python\` (load \`python\`), then show the result as a chart or simulation |
| Many moving parts that together decide the outcome (linkages, IK, fields, feedback loops, population or market models, algorithms on changing input) | **Simulation**: \`<avenire-sim>\`, load \`simulation\`                                       |
| A long ordered story: a process, a derivation, "how X leads to Y"                                                                                    | **Video**: not available in chat yet; explain in steps instead                           |

Tie-breakers:

- Prefer the cheapest modality that teaches the point: text < chart < simulation.
- "Compare / trend" → chart. "Show me how it moves" → simulation. "How likely / what if we
  tried all" → \`run_python\`, then a chart.
- A slider must never re-run Python. If a parameter matters, make it a simulation control
  and re-implement the cheap part in the simulation, or have \`run_python\` precompute a
  grid the simulation interpolates.
- Never invent numbers. Chart values come from the user's material or from \`run_python\`.

## Before writing a visual

1. Call \`get_page_context\`. Fit the visual to the surface, platform, width, colour scheme,
   theme tokens, kits and budgets it reports. On \`mobile\`, keep simulations simple.
2. Give the visual a short unique \`id\` (\`id="vis-orbit"\`) and a \`title\`.
3. To change a visual listed in \`existingVisuals\`, write a new one with
   \`revises="<its id>"\`. Don't repeat the old one.

## Writing it

- Write the tag inline where it belongs in the explanation, never inside a code fence.
- Keep explanations outside the visual; inside, only labels, values, legends and readouts.
- One strong visual beats several small ones.
`,
  },
} as const satisfies Record<string, SkillDefinition>;

export type SkillId = keyof typeof SKILL_MAP;

export const AVAILABLE_SKILLS = ["concept-explainer","flashcard-generator","quiz-creator","study-notes-creator","summary-generator","python","chart","simulation","visuals"] as const;
export const STUDY_SKILLS = ["concept-explainer","flashcard-generator","quiz-creator","study-notes-creator","summary-generator"] as const;
export const VISUAL_SKILLS = ["chart","simulation","visuals"] as const;
export const TOOL_SKILLS = ["python"] as const;
