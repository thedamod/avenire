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
\`{ "front": string, "back": string, "notes"?: string, "sourceFileIds": string[] }\`, with
markdown allowed in \`front\`, \`back\` and \`notes\`. Every card cites the files it came from.

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
  "sourceFileIds": ["file_..."]
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
- [ ] Mnemonics added for difficult files
- [ ] Cards are context-independent (understandable alone)
- [ ] Cloze deletions used where appropriate
- [ ] Every card cites at least one source file
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
    description: "Use sandbox tools for real computation - brute force, statistics, symbolic math and data processing over the user's material. Load before the first sandbox call.",
    section: "tool-guidelines",
    path: "sections/tool-guidelines/python.md",
    content: `---
name: python
description: Use sandbox tools for real computation - brute force, statistics, symbolic math and data processing over the user's material. Load before the first sandbox call.
---

# Python

One ephemeral Linux sandbox persists per thread, with Python 3.12, numpy, scipy,
pandas, sympy, matplotlib, Manim, ffmpeg and LaTeX preinstalled. Network is blocked;
write scripts and data locally. The hard lifetime cap is 60 minutes; each command
has a 120-second default timeout and a maximum of 900 seconds.

Use it for enumeration, Monte Carlo, parameter sweeps, numerical solutions,
statistics and checked symbolic math. Prefer prose for answers you can give exactly.

1. \`sandbox_write({ path: "analysis.py", content: "..." })\` writes the script.
2. \`sandbox_exec({ command: "python analysis.py" })\` runs it. Seed randomness,
   print labelled results and keep output concise (64 KB maximum).
3. Save figures or data to files explicitly, then call
   \`sandbox_download_artifact({ path: "figure.png" })\`. Downloads expire after seven days.
   For Manim, render with \`manim -ql scene.py SceneName\` and download the resulting MP4.
4. Use \`sandbox_read\` for text or \`encoding: "base64"\` for binary files (up to 1 MB).
5. Call \`sandbox_close\` when the task is done unless waiting for the user's input.
   After that follow-up, close it.

If a command fails, read the output and fix the cause before retrying. Explain any
remaining limitation. Never invent results. For interactive exploration, pass computed
data into a standalone HTML document via \`render_widget\`; do not re-run Python per slider.
`,
  },
  "chart": {
    id: "chart",
    title: "Chart",
    description: "Render a chart as a standalone HTML document through render_widget. Use for values, categories, trends and distributions.",
    section: "visual-guidelines",
    path: "sections/visual-guidelines/chart.md",
    content: `---
name: chart
description: Render a chart as a standalone HTML document through render_widget. Use for values, categories, trends and distributions.
---

# Chart

Call \`get_page_context\` first, then \`render_widget({ title, html })\` with a complete
HTML document. Draw with inline SVG or Canvas and inline JavaScript; no external
libraries or network requests. Embed rows directly from the user's material or
sandbox results. Never invent values.

Pick the simplest mark: bars for comparison, lines for trends, points for relationships,
histograms or box plots for distributions. At most five series. Label axes with units;
provide a legend and accessible text or a data table. Pair colour with labels or patterns.
Use the theme's \`--chart-1\` through \`--chart-6\`, \`--foreground\`, \`--muted-foreground\`,
\`--border\`, font, spacing and type variables. For Canvas, listen for
\`avenire:themechange\` and re-read computed variables before redrawing.

Add tooltips or filters only when they support the question. Keep layout responsive
to the measured width. Put the takeaway in chat prose after the widget.
Inline \`<avenire-chart>\` tags are coming later; do not write them now.
`,
  },
  "simulation": {
    id: "simulation",
    title: "Simulation",
    description: "Render an interactive simulation as standalone HTML through render_widget when interacting parameters determine the outcome.",
    section: "visual-guidelines",
    path: "sections/visual-guidelines/simulation.md",
    content: `---
name: simulation
description: Render an interactive simulation as standalone HTML through render_widget when interacting parameters determine the outcome.
---

# Simulation

Call \`get_page_context\` first, then send a complete HTML document to \`render_widget\`.
Use inline CSS/JavaScript, SVG or Canvas, accessible labelled controls and readable
numeric readouts. At least two interacting parameters or a draggable state should
justify the interaction; otherwise use a chart.

Implement the model locally in JavaScript. No external kits, scripts, fonts, images or
network requests are available. For expensive computation, use sandbox tools once
and embed a small precomputed grid for interpolation. Seed randomness for reproducibility.
Never re-run Python for every control change.

Use the provided theme variables for colours, fonts, spacing and sizes. Canvas should
listen for \`avenire:themechange\` and re-read tokens from \`getComputedStyle\` before drawing.
Use \`requestAnimationFrame\`, stay within the frame budget, pause when hidden and
respect \`prefers-reduced-motion\`. Keep mobile interactions simple and supply a text
alternative. Always explain what the learner should notice in chat prose.

Inline \`<avenire-sim>\` tags and runtime kits are coming later; do not write them now.
`,
  },
  "visuals": {
    id: "visuals",
    title: "Visuals",
    description: "Choose text, chart or interactive simulation to teach a concept. Load before render_widget.",
    section: "visual-guidelines",
    path: "sections/visual-guidelines/visuals.md",
    content: `---
name: visuals
description: Choose text, chart or interactive simulation to teach a concept. Load before render_widget.
---

# Visuals

Choose what lets the learner compare, follow, compute or manipulate the idea.
Give a short objective before the visual and explain its takeaway in prose afterwards.

| Need                                             | Use                                                    |
| ------------------------------------------------ | ------------------------------------------------------ |
| A formula, definition or small comparison        | Markdown and math                                      |
| Values, categories, time series or distributions | Chart; load \`chart\`                                    |
| Brute force, Monte Carlo, sweeps or statistics   | Sandbox tools; load \`python\`, then show the results    |
| Interacting parameters or a draggable state      | Interactive HTML simulation; load \`simulation\`         |
| A rendered animation file                        | Sandbox Manim/ffmpeg, then \`sandbox_download_artifact\` |

Prefer the simplest visual that teaches the point. Never invent data: use the user's
material or computed sandbox results. A slider must not re-run Python; precompute a
small grid and interpolate locally when needed.

Call \`get_page_context\` first. Fit the content to its width, platform, colour scheme,
theme variables and budgets. Then call \`render_widget({ title, html })\` with a standalone
HTML document containing only inline CSS/JS and embedded data. Use \`var(--...)\` for
colours, fonts, spacing and sizes. No network, external scripts, fonts or images.
Give controls accessible labels and include a text alternative. Explain every visual
in chat prose; do not end on a tool result.

Inline \`<avenire-chart>\` and \`<avenire-sim>\` tags and runtime kits are coming later.
Do not write those tags now: all HTML visuals go through \`render_widget\`.
`,
  },
} as const satisfies Record<string, SkillDefinition>;

export type SkillId = keyof typeof SKILL_MAP;

export const AVAILABLE_SKILLS = ["concept-explainer","flashcard-generator","quiz-creator","study-notes-creator","summary-generator","python","chart","simulation","visuals"] as const;
export const STUDY_SKILLS = ["concept-explainer","flashcard-generator","quiz-creator","study-notes-creator","summary-generator"] as const;
export const VISUAL_SKILLS = ["chart","simulation","visuals"] as const;
export const TOOL_SKILLS = ["python"] as const;
