// This file is generated. Do not edit by hand.
// Run: pnpm --filter @avenire/ai skills:generate

export type SkillSection = "study-guidelines" | "tool-guidelines" | "visual-examples" | "visual-guidelines";

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
  "sandbox": {
    id: "sandbox",
    title: "Sandbox",
    description: "Use sandbox tools for real computation, data processing, matplotlib and manimgx media, and KiCad exports.",
    section: "tool-guidelines",
    path: "sections/tool-guidelines/sandbox.md",
    content: `---
name: sandbox
description: Use sandbox tools for real computation, data processing, matplotlib and manimgx media, and KiCad exports.
---

# Sandbox

Use the Daytona thread sandbox for computation and shareable files. Python 3 scientific packages, matplotlib, pandas/openpyxl, manimgx, \`kicad-cli\`, Node and pnpm are available. Treat it as ephemeral; keep source and output paths explicit. Never claim a render, calculation or export succeeded until you inspect its command output and file.

1. \`sandbox_write({ path: "work.py", content: "..." })\` writes code/data.
2. \`sandbox_exec({ command: "python work.py" })\` computes; inspect exit status and concise stdout/stderr. Use the tool's supported timeout for long renders and stay within output caps. Break long jobs into inspect and final render stages.
3. \`sandbox_read\` reads text or bounded file content; inspect files with scripts (\`file\`, image dimensions, CSV row count) before publishing. For charts, print JSON aggregates and embed them into widget HTML.
4. \`publish_asset({ path: "figure.png", title: "..." })\` uploads PNG/SVG/GIF/MP4/PDF/HTML and returns a permanent \`{assetId,url}\` for chat. Explain what it shows and cite source data. Do not use the URL inside a widget under \`connect-src 'none'\`.
5. Call \`sandbox_close\` after the work is complete, except while waiting for needed user input; close after that follow-up.

## Matplotlib and spreadsheets

Select Agg before pyplot. Use Avenire light/dark colours copied from the current \`style\` tokens into the script. Set a restrained \`axes.edgecolor\`, \`grid.color\`, font sizes, and \`lines.linewidth\` (~1–1.5 pt) through \`rcParams\`; export at readable dimensions/DPI. Example:

\`\`\`python
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
plt.rcParams.update({'figure.facecolor':'#faf9f5','axes.facecolor':'#faf9f5',
                     'axes.edgecolor':'#b4b0a9','grid.color':'#d7d3cc',
                     'axes.linewidth':0.6,'lines.linewidth':1.2,'font.size':10})
fig, ax = plt.subplots(figsize=(7, 4), layout='constrained')
ax.plot([1,2,3], [2,3,5], color='#6050a5')
ax.grid(alpha=.5)
fig.savefig('figure.png', dpi=180)
fig.savefig('figure.svg')
\`\`\`

For CSV/XLSX: \`pd.read_csv\` or \`pd.read_excel(engine='openpyxl')\`; inspect dtypes, parse dates, coerce numbers with an explicit missing-value policy, group and aggregate, then export compact \`to_json(orient='records', date_format='iso')\`. Avoid dumping private rows into tool output. Animate GIFs with matplotlib \`PillowWriter\` or \`imageio\`; MP4 with \`FFMpegWriter\` if ffmpeg is present. Check output size and a sample frame.

## ManimGX, KiCad, Node

Use \`import manimgx as m\`, \`class SceneName(m.Scene)\`, and \`manimgx inspect scene.py\` first. Inspect writes a timeline, checks sampled 2D layout, and a storyboard PNG; inspect the storyboard and fix overlap before final render. Draft with \`manimgx render scene.py SceneName -r 1280x720 --fps 30\`; keep scenes short, then render final size. ManimGX uses built-in Typst conversion for \`MathTex\`/\`Tex\`: do not install LaTeX, Manim CE or ffmpeg for it. Use time-based state, not frame counting. Its CE-compatible APIs and differences are documented at https://manimgx.academa.ai/llms.txt and https://manimgx.academa.ai/user-guide/coming-from-manim-ce/index.md.

Use \`kicad-cli sch export svg|pdf\` or \`kicad-cli pcb export svg|pdf|gerbers\` on the actual design, inspect CLI help for exact options, and publish the generated file. For Node scripts, write then run with \`node\` or \`pnpm\`, capture bounded output, and publish only useful artifacts. Do not install packages just to make an ordinary chart.
`,
  },
  "anatomy-arcade-cabinet": {
    id: "anatomy-arcade-cabinet",
    title: "Arcade cabinet example",
    description: "A cabinet cutaway: a coin travels from slot through chute to switch and lights the screen.",
    section: "visual-examples",
    path: "sections/visual-examples/anatomy-arcade-cabinet.md",
    content: `---
name: anatomy-arcade-cabinet
description: A cabinet cutaway: a coin travels from slot through chute to switch and lights the screen.
---

# Arcade cabinet example

A compact Avenire-token adaptation of the corresponding Anatomy example. Load \`anatomy\`, \`style\`, and \`kit-api\` before adapting it. The example is standalone HTML for \`preview_widget\` then \`render_widget\`; explain the mechanism and the simplified model in prose.

\`\`\`html
<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>
*{box-sizing:border-box}body{margin:0;background:var(--background);color:var(--foreground);font-family:var(--font-sans)}
.card{border:var(--stroke-hairline) solid var(--figure-frame);border-radius:var(--radius);background:var(--card);padding:var(--space-4);max-width:700px;margin:auto}
.head{display:flex;align-items:baseline;justify-content:space-between;gap:var(--space-3);font-size:var(--text-sm)}
.head strong{font-size:var(--text-lg)}.read{font-family:var(--font-mono);font-size:var(--text-sm);color:var(--foreground)}
.hint,.caption{color:var(--muted-foreground);font-size:var(--text-sm);line-height:var(--leading-normal)}
.stage{min-height:260px;display:grid;place-items:center;margin:var(--space-3) 0}.stage svg{max-width:100%}
.controls{display:flex;gap:var(--space-3);align-items:center;flex-wrap:wrap}.controls label{display:flex;gap:var(--space-2);align-items:center;font-size:var(--text-sm)}
input[type=range]{width:min(250px,65vw);accent-color:var(--primary)}button,input[type=text]{font:inherit;border:var(--stroke-thin) solid var(--border);border-radius:calc(var(--radius) / 2);background:var(--secondary);color:var(--secondary-foreground);padding:var(--space-2)}
:focus-visible{outline:var(--stroke-emphasis) solid var(--ring);outline-offset:2px}
</style></head><body class="iso"><figure class="card"><div class="head"><strong>Arcade cabinet</strong><output class="read" id="readout" aria-live="polite"></output></div><div class="stage" id="stage"></div><div class="controls"><button id="coin" type="button">Insert coin</button></div><p class="hint">Insert a coin to follow the switch pulse</p><figcaption class="caption">The coin trips a switch; the board then lights the CRT. The chute and screen share one event state.</figcaption></figure><script type="module">
import { fitProjection, boxCorners, slabOf, cylinder, solidSvg, lineSvg, lineOnTop, ring, iso, figureSvg, ISO_CSS } from '/kits/iso.js';
const css = document.createElement('style');
css.textContent = ISO_CSS + \`.iso{--anatomy-page:var(--background);--anatomy-card:var(--card);--anatomy-text:var(--foreground);--anatomy-strong:var(--foreground);--anatomy-muted:var(--figure-label);--anatomy-paper:var(--card);--anatomy-face:var(--card);--anatomy-top:var(--secondary);--anatomy-shade-0:var(--muted);--anatomy-shade-1:var(--secondary);--anatomy-shade-2:var(--card);--anatomy-shade-3:var(--canvas);--anatomy-lit-top:var(--accent);--anatomy-lit-shade:var(--secondary);--anatomy-hi:var(--foreground);--anatomy-mid:var(--muted-foreground);--anatomy-lo:var(--border);--anatomy-faint:var(--canvas-grid);--anatomy-lit:var(--chart-1);--anatomy-halo:var(--foreground);--anatomy-halo-opacity:.08;--anatomy-dot:var(--foreground);--anatomy-red:var(--destructive);--anatomy-green:var(--chart-4);--anatomy-blue:var(--chart-2);--anatomy-weight:var(--stroke-hairline);--anatomy-mono:var(--font-mono);--anatomy-lift:none}\`;
document.head.append(css);
const base={x:-100,y:-55,w:200,d:110,r:6};
const P=fitProjection(boxCorners(base,-8,80),480,260,{pad:30});
const block=(p,z,h,tone='mid',lit=false)=>solidSvg(slabOf(p,z,h,P,6,0.7),{tone,lit});
const round=(x,y,r,z,h,tone='mid',lit=false)=>solidSvg(cylinder(x,y,r,z,h,P,28,0.5),{tone,lit});
const edge=(a,b,z,tone='lo')=>lineSvg(lineOnTop(a,b,z,P),{tone});
const feet=()=>[[-82,-40],[82,-40],[-82,40],[82,40]].map(([x,y])=>round(x,y,5,-8,3,'lo')).join('');
const foundation=()=>feet()+block(base,-5,5,'mid')+block({x:-88,y:-43,w:176,d:86,r:4},0,1,'faint');
const show=(body,label,readout)=>{document.getElementById('stage').innerHTML=figureSvg({width:480,height:260,label,body});document.getElementById('readout').textContent=readout};

let step=0;
function draw(){let b=foundation();
b+=block({x:-70,y:-25,w:42,d:48,r:2},1,62,'hi');
b+=block({x:-22,y:-23,w:65,d:46,r:2},1,35,'mid');
b+=block({x:45,y:-20,w:29,d:38,r:2},1,12,'mid');
b+=edge([-53,-8],[-25,-8],57,'hi')+edge([-25,-8],[5,-8],35,'hi');
b+=round(-51,-8,4,58,2,'lit',step>=1);
b+=round(9,-8,3,36,2,step>=2?'lit':'mid',step>=2);
b+=block({x:51,y:-13,w:16,d:24,r:1},13,1,step>=3?'lit':'lo',step>=3);
show(b,'Arcade cabinet cutaway with chute, switch, board and screen',step===0?'ready':step===1?'coin in chute':step===2?'switch closed':'screen on');}
document.getElementById('coin').addEventListener('click',()=>{step=1;draw();setTimeout(()=>{step=2;draw()},380);setTimeout(()=>{step=3;draw()},760)});draw();
</script></body></html>
\`\`\`
`,
  },
  "anatomy-desk-computer": {
    id: "anatomy-desk-computer",
    title: "Desk computer example",
    description: "A desk computer whose typed input appears on its screen and collapses when power is off.",
    section: "visual-examples",
    path: "sections/visual-examples/anatomy-desk-computer.md",
    content: `---
name: anatomy-desk-computer
description: A desk computer whose typed input appears on its screen and collapses when power is off.
---

# Desk computer example

A compact Avenire-token adaptation of the corresponding Anatomy example. Load \`anatomy\`, \`style\`, and \`kit-api\` before adapting it. The example is standalone HTML for \`preview_widget\` then \`render_widget\`; explain the mechanism and the simplified model in prose.

\`\`\`html
<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>
*{box-sizing:border-box}body{margin:0;background:var(--background);color:var(--foreground);font-family:var(--font-sans)}
.card{border:var(--stroke-hairline) solid var(--figure-frame);border-radius:var(--radius);background:var(--card);padding:var(--space-4);max-width:700px;margin:auto}
.head{display:flex;align-items:baseline;justify-content:space-between;gap:var(--space-3);font-size:var(--text-sm)}
.head strong{font-size:var(--text-lg)}.read{font-family:var(--font-mono);font-size:var(--text-sm);color:var(--foreground)}
.hint,.caption{color:var(--muted-foreground);font-size:var(--text-sm);line-height:var(--leading-normal)}
.stage{min-height:260px;display:grid;place-items:center;margin:var(--space-3) 0}.stage svg{max-width:100%}
.controls{display:flex;gap:var(--space-3);align-items:center;flex-wrap:wrap}.controls label{display:flex;gap:var(--space-2);align-items:center;font-size:var(--text-sm)}
input[type=range]{width:min(250px,65vw);accent-color:var(--primary)}button,input[type=text]{font:inherit;border:var(--stroke-thin) solid var(--border);border-radius:calc(var(--radius) / 2);background:var(--secondary);color:var(--secondary-foreground);padding:var(--space-2)}
:focus-visible{outline:var(--stroke-emphasis) solid var(--ring);outline-offset:2px}
</style></head><body class="iso"><figure class="card"><div class="head"><strong>Desk computer</strong><output class="read" id="readout" aria-live="polite"></output></div><div class="stage" id="stage"></div><div class="controls"><label>Keys <input id="keys" type="text" maxlength="12" value="HELLO" aria-label="Text to display"></label><button id="power" type="button">Power off</button></div><p class="hint">Type a short line; toggle power</p><figcaption class="caption">The keyboard feeds the screen; turning power off removes the displayed line.</figcaption></figure><script type="module">
import { fitProjection, boxCorners, slabOf, cylinder, solidSvg, lineSvg, lineOnTop, ring, iso, figureSvg, ISO_CSS } from '/kits/iso.js';
const css = document.createElement('style');
css.textContent = ISO_CSS + \`.iso{--anatomy-page:var(--background);--anatomy-card:var(--card);--anatomy-text:var(--foreground);--anatomy-strong:var(--foreground);--anatomy-muted:var(--figure-label);--anatomy-paper:var(--card);--anatomy-face:var(--card);--anatomy-top:var(--secondary);--anatomy-shade-0:var(--muted);--anatomy-shade-1:var(--secondary);--anatomy-shade-2:var(--card);--anatomy-shade-3:var(--canvas);--anatomy-lit-top:var(--accent);--anatomy-lit-shade:var(--secondary);--anatomy-hi:var(--foreground);--anatomy-mid:var(--muted-foreground);--anatomy-lo:var(--border);--anatomy-faint:var(--canvas-grid);--anatomy-lit:var(--chart-1);--anatomy-halo:var(--foreground);--anatomy-halo-opacity:.08;--anatomy-dot:var(--foreground);--anatomy-red:var(--destructive);--anatomy-green:var(--chart-4);--anatomy-blue:var(--chart-2);--anatomy-weight:var(--stroke-hairline);--anatomy-mono:var(--font-mono);--anatomy-lift:none}\`;
document.head.append(css);
const base={x:-100,y:-55,w:200,d:110,r:6};
const P=fitProjection(boxCorners(base,-8,80),480,260,{pad:30});
const block=(p,z,h,tone='mid',lit=false)=>solidSvg(slabOf(p,z,h,P,6,0.7),{tone,lit});
const round=(x,y,r,z,h,tone='mid',lit=false)=>solidSvg(cylinder(x,y,r,z,h,P,28,0.5),{tone,lit});
const edge=(a,b,z,tone='lo')=>lineSvg(lineOnTop(a,b,z,P),{tone});
const feet=()=>[[-82,-40],[82,-40],[-82,40],[82,40]].map(([x,y])=>round(x,y,5,-8,3,'lo')).join('');
const foundation=()=>feet()+block(base,-5,5,'mid')+block({x:-88,y:-43,w:176,d:86,r:4},0,1,'faint');
const show=(body,label,readout)=>{document.getElementById('stage').innerHTML=figureSvg({width:480,height:260,label,body});document.getElementById('readout').textContent=readout};

let on=true;const keys=document.getElementById('keys');
function draw(){let b=foundation();
b+=block({x:-70,y:-30,w:95,d:58,r:3},1,37,'hi');
b+=block({x:32,y:-31,w:52,d:60,r:3},1,4,'mid');
for(let row=0;row<3;row++)for(let col=0;col<8;col++)b+=block({x:35+col*5.6,y:-25+row*12,w:4,d:7,r:.4},5,.6,'lo');
const [sx,sy]=iso([-48,-8,39],P);
b+=\`<g><rect x="\${sx-34}" y="\${sy-22}" width="68" height="37" rx="2" fill="var(--canvas)" stroke="var(--figure-frame)" stroke-width="var(--stroke-thin)"/><text x="\${sx-29}" y="\${sy+1}" fill="var(--chart-1)" font-size="9" font-family="var(--font-mono)">\${on?keys.value.replaceAll('&','&amp;').replaceAll('<','&lt;'):''}</text></g>\`;
show(b,'Desk computer with keyboard and lit display',on?'power on · '+keys.value:'power off');}
keys.addEventListener('input',draw);document.getElementById('power').addEventListener('click',e=>{on=!on;e.currentTarget.textContent=on?'Power off':'Power on';draw()});draw();
</script></body></html>
\`\`\`
`,
  },
  "anatomy-dial-indicator": {
    id: "anatomy-dial-indicator",
    title: "Dial indicator example",
    description: "A dial indicator whose plunger displacement moves a needle and numeric reading together.",
    section: "visual-examples",
    path: "sections/visual-examples/anatomy-dial-indicator.md",
    content: `---
name: anatomy-dial-indicator
description: A dial indicator whose plunger displacement moves a needle and numeric reading together.
---

# Dial indicator example

A compact Avenire-token adaptation of the corresponding Anatomy example. Load \`anatomy\`, \`style\`, and \`kit-api\` before adapting it. The example is standalone HTML for \`preview_widget\` then \`render_widget\`; explain the mechanism and the simplified model in prose.

\`\`\`html
<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>
*{box-sizing:border-box}body{margin:0;background:var(--background);color:var(--foreground);font-family:var(--font-sans)}
.card{border:var(--stroke-hairline) solid var(--figure-frame);border-radius:var(--radius);background:var(--card);padding:var(--space-4);max-width:700px;margin:auto}
.head{display:flex;align-items:baseline;justify-content:space-between;gap:var(--space-3);font-size:var(--text-sm)}
.head strong{font-size:var(--text-lg)}.read{font-family:var(--font-mono);font-size:var(--text-sm);color:var(--foreground)}
.hint,.caption{color:var(--muted-foreground);font-size:var(--text-sm);line-height:var(--leading-normal)}
.stage{min-height:260px;display:grid;place-items:center;margin:var(--space-3) 0}.stage svg{max-width:100%}
.controls{display:flex;gap:var(--space-3);align-items:center;flex-wrap:wrap}.controls label{display:flex;gap:var(--space-2);align-items:center;font-size:var(--text-sm)}
input[type=range]{width:min(250px,65vw);accent-color:var(--primary)}button,input[type=text]{font:inherit;border:var(--stroke-thin) solid var(--border);border-radius:calc(var(--radius) / 2);background:var(--secondary);color:var(--secondary-foreground);padding:var(--space-2)}
:focus-visible{outline:var(--stroke-emphasis) solid var(--ring);outline-offset:2px}
</style></head><body class="iso"><figure class="card"><div class="head"><strong>Dial indicator</strong><output class="read" id="readout" aria-live="polite"></output></div><div class="stage" id="stage"></div><div class="controls"><label>Displacement <input id="value" type="range" min="0" max="10" step="0.1" value="4"></label></div><p class="hint">Move the specimen under the plunger</p><figcaption class="caption">The plunger height, needle angle, and readout all derive from the same displacement.</figcaption></figure><script type="module">
import { fitProjection, boxCorners, slabOf, cylinder, solidSvg, lineSvg, lineOnTop, ring, iso, figureSvg, ISO_CSS } from '/kits/iso.js';
const css = document.createElement('style');
css.textContent = ISO_CSS + \`.iso{--anatomy-page:var(--background);--anatomy-card:var(--card);--anatomy-text:var(--foreground);--anatomy-strong:var(--foreground);--anatomy-muted:var(--figure-label);--anatomy-paper:var(--card);--anatomy-face:var(--card);--anatomy-top:var(--secondary);--anatomy-shade-0:var(--muted);--anatomy-shade-1:var(--secondary);--anatomy-shade-2:var(--card);--anatomy-shade-3:var(--canvas);--anatomy-lit-top:var(--accent);--anatomy-lit-shade:var(--secondary);--anatomy-hi:var(--foreground);--anatomy-mid:var(--muted-foreground);--anatomy-lo:var(--border);--anatomy-faint:var(--canvas-grid);--anatomy-lit:var(--chart-1);--anatomy-halo:var(--foreground);--anatomy-halo-opacity:.08;--anatomy-dot:var(--foreground);--anatomy-red:var(--destructive);--anatomy-green:var(--chart-4);--anatomy-blue:var(--chart-2);--anatomy-weight:var(--stroke-hairline);--anatomy-mono:var(--font-mono);--anatomy-lift:none}\`;
document.head.append(css);
const base={x:-100,y:-55,w:200,d:110,r:6};
const P=fitProjection(boxCorners(base,-8,80),480,260,{pad:30});
const block=(p,z,h,tone='mid',lit=false)=>solidSvg(slabOf(p,z,h,P,6,0.7),{tone,lit});
const round=(x,y,r,z,h,tone='mid',lit=false)=>solidSvg(cylinder(x,y,r,z,h,P,28,0.5),{tone,lit});
const edge=(a,b,z,tone='lo')=>lineSvg(lineOnTop(a,b,z,P),{tone});
const feet=()=>[[-82,-40],[82,-40],[-82,40],[82,40]].map(([x,y])=>round(x,y,5,-8,3,'lo')).join('');
const foundation=()=>feet()+block(base,-5,5,'mid')+block({x:-88,y:-43,w:176,d:86,r:4},0,1,'faint');
const show=(body,label,readout)=>{document.getElementById('stage').innerHTML=figureSvg({width:480,height:260,label,body});document.getElementById('readout').textContent=readout};

const value=document.getElementById('value');
function draw(){const v=Number(value.value);let b=foundation();
b+=block({x:-62,y:-18,w:9,d:34,r:1},1,68,'hi');
b+=block({x:-62,y:-17,w:112,d:5,r:1},64,5,'mid');
b+=round(36,-14,22,68,7,'hi');
const a=-2.4+v/10*4.8;const start=[36,-14],end=[36+18*Math.cos(a),-14+18*Math.sin(a)];
b+=edge(start,end,76,'lit')+lineSvg(ring(36,-14,18,76,P,48),{tone:'lo'});
b+=block({x:-12,y:-18,w:24,d:34,r:2},1,4,'mid');
b+=round(36,-14,2,44+v,24-v,'lit',true);
show(b,'Dial gauge with plunger and needle',v.toFixed(1)+' mm');}
value.addEventListener('input',draw);draw();
</script></body></html>
\`\`\`
`,
  },
  "anatomy-raptor-engine": {
    id: "anatomy-raptor-engine",
    title: "Raptor engine example",
    description: "A rocket engine test-stand cutaway with pressure and ignition controls.",
    section: "visual-examples",
    path: "sections/visual-examples/anatomy-raptor-engine.md",
    content: `---
name: anatomy-raptor-engine
description: A rocket engine test-stand cutaway with pressure and ignition controls.
---

# Raptor engine example

A compact Avenire-token adaptation of the corresponding Anatomy example. Load \`anatomy\`, \`style\`, and \`kit-api\` before adapting it. The example is standalone HTML for \`preview_widget\` then \`render_widget\`; explain the mechanism and the simplified model in prose.

\`\`\`html
<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>
*{box-sizing:border-box}body{margin:0;background:var(--background);color:var(--foreground);font-family:var(--font-sans)}
.card{border:var(--stroke-hairline) solid var(--figure-frame);border-radius:var(--radius);background:var(--card);padding:var(--space-4);max-width:700px;margin:auto}
.head{display:flex;align-items:baseline;justify-content:space-between;gap:var(--space-3);font-size:var(--text-sm)}
.head strong{font-size:var(--text-lg)}.read{font-family:var(--font-mono);font-size:var(--text-sm);color:var(--foreground)}
.hint,.caption{color:var(--muted-foreground);font-size:var(--text-sm);line-height:var(--leading-normal)}
.stage{min-height:260px;display:grid;place-items:center;margin:var(--space-3) 0}.stage svg{max-width:100%}
.controls{display:flex;gap:var(--space-3);align-items:center;flex-wrap:wrap}.controls label{display:flex;gap:var(--space-2);align-items:center;font-size:var(--text-sm)}
input[type=range]{width:min(250px,65vw);accent-color:var(--primary)}button,input[type=text]{font:inherit;border:var(--stroke-thin) solid var(--border);border-radius:calc(var(--radius) / 2);background:var(--secondary);color:var(--secondary-foreground);padding:var(--space-2)}
:focus-visible{outline:var(--stroke-emphasis) solid var(--ring);outline-offset:2px}
</style></head><body class="iso"><figure class="card"><div class="head"><strong>Raptor engine</strong><output class="read" id="readout" aria-live="polite"></output></div><div class="stage" id="stage"></div><div class="controls"><label>Pressure <input id="pressure" type="range" min="0" max="100" value="45"></label><button id="ignite" type="button">Ignite</button></div><p class="hint">Increase chamber pressure; ignite to trace thrust</p><figcaption class="caption">A simplified test stand: higher model pressure lengthens the exhaust, while the readout reports proportional thrust. This is an analogy, not flight data.</figcaption></figure><script type="module">
import { fitProjection, boxCorners, slabOf, cylinder, solidSvg, lineSvg, lineOnTop, ring, iso, figureSvg, ISO_CSS } from '/kits/iso.js';
const css = document.createElement('style');
css.textContent = ISO_CSS + \`.iso{--anatomy-page:var(--background);--anatomy-card:var(--card);--anatomy-text:var(--foreground);--anatomy-strong:var(--foreground);--anatomy-muted:var(--figure-label);--anatomy-paper:var(--card);--anatomy-face:var(--card);--anatomy-top:var(--secondary);--anatomy-shade-0:var(--muted);--anatomy-shade-1:var(--secondary);--anatomy-shade-2:var(--card);--anatomy-shade-3:var(--canvas);--anatomy-lit-top:var(--accent);--anatomy-lit-shade:var(--secondary);--anatomy-hi:var(--foreground);--anatomy-mid:var(--muted-foreground);--anatomy-lo:var(--border);--anatomy-faint:var(--canvas-grid);--anatomy-lit:var(--chart-1);--anatomy-halo:var(--foreground);--anatomy-halo-opacity:.08;--anatomy-dot:var(--foreground);--anatomy-red:var(--destructive);--anatomy-green:var(--chart-4);--anatomy-blue:var(--chart-2);--anatomy-weight:var(--stroke-hairline);--anatomy-mono:var(--font-mono);--anatomy-lift:none}\`;
document.head.append(css);
const base={x:-100,y:-55,w:200,d:110,r:6};
const P=fitProjection(boxCorners(base,-8,80),480,260,{pad:30});
const block=(p,z,h,tone='mid',lit=false)=>solidSvg(slabOf(p,z,h,P,6,0.7),{tone,lit});
const round=(x,y,r,z,h,tone='mid',lit=false)=>solidSvg(cylinder(x,y,r,z,h,P,28,0.5),{tone,lit});
const edge=(a,b,z,tone='lo')=>lineSvg(lineOnTop(a,b,z,P),{tone});
const feet=()=>[[-82,-40],[82,-40],[-82,40],[82,40]].map(([x,y])=>round(x,y,5,-8,3,'lo')).join('');
const foundation=()=>feet()+block(base,-5,5,'mid')+block({x:-88,y:-43,w:176,d:86,r:4},0,1,'faint');
const show=(body,label,readout)=>{document.getElementById('stage').innerHTML=figureSvg({width:480,height:260,label,body});document.getElementById('readout').textContent=readout};

let firing=false;const pressure=document.getElementById('pressure');
function draw(){const p=Number(pressure.value);let b=foundation();
b+=block({x:-60,y:-43,w:8,d:86,r:1},1,68,'hi')+block({x:54,y:-43,w:8,d:86,r:1},1,68,'hi');
b+=block({x:-60,y:-43,w:122,d:8,r:1},69,4,'mid');
b+=round(0,0,23,28,38,'hi');b+=round(0,0,13,3,25,'mid');
for(const y of [-24,24])b+=block({x:-47,y:y-2,w:33,d:4,r:1},36,3,'lo');
if(firing&&p>0){const [x,y]=iso([0,0,3],P);b+=\`<path d="M\${x-10} \${y} Q\${x-5} \${y+24+p*.18} \${x} \${y+35+p*.3} Q\${x+7} \${y+20+p*.18} \${x+10} \${y}Z" fill="var(--chart-3)" opacity=".58"/>\`;}
show(b,'Rocket engine on a simplified test stand',firing?\`ignited · \${p}% relative thrust\`:'cold · 0% relative thrust');}
pressure.addEventListener('input',draw);document.getElementById('ignite').addEventListener('click',e=>{firing=!firing;e.currentTarget.textContent=firing?'Shut down':'Ignite';draw()});draw();
</script></body></html>
\`\`\`
`,
  },
  "anatomy-ripple-tank": {
    id: "anatomy-ripple-tank",
    title: "Ripple tank example",
    description: "A ripple tank where frequency and source separation change the interference pattern.",
    section: "visual-examples",
    path: "sections/visual-examples/anatomy-ripple-tank.md",
    content: `---
name: anatomy-ripple-tank
description: A ripple tank where frequency and source separation change the interference pattern.
---

# Ripple tank example

A compact Avenire-token adaptation of the corresponding Anatomy example. Load \`anatomy\`, \`style\`, and \`kit-api\` before adapting it. The example is standalone HTML for \`preview_widget\` then \`render_widget\`; explain the mechanism and the simplified model in prose.

\`\`\`html
<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>
*{box-sizing:border-box}body{margin:0;background:var(--background);color:var(--foreground);font-family:var(--font-sans)}
.card{border:var(--stroke-hairline) solid var(--figure-frame);border-radius:var(--radius);background:var(--card);padding:var(--space-4);max-width:700px;margin:auto}
.head{display:flex;align-items:baseline;justify-content:space-between;gap:var(--space-3);font-size:var(--text-sm)}
.head strong{font-size:var(--text-lg)}.read{font-family:var(--font-mono);font-size:var(--text-sm);color:var(--foreground)}
.hint,.caption{color:var(--muted-foreground);font-size:var(--text-sm);line-height:var(--leading-normal)}
.stage{min-height:260px;display:grid;place-items:center;margin:var(--space-3) 0}.stage svg{max-width:100%}
.controls{display:flex;gap:var(--space-3);align-items:center;flex-wrap:wrap}.controls label{display:flex;gap:var(--space-2);align-items:center;font-size:var(--text-sm)}
input[type=range]{width:min(250px,65vw);accent-color:var(--primary)}button,input[type=text]{font:inherit;border:var(--stroke-thin) solid var(--border);border-radius:calc(var(--radius) / 2);background:var(--secondary);color:var(--secondary-foreground);padding:var(--space-2)}
:focus-visible{outline:var(--stroke-emphasis) solid var(--ring);outline-offset:2px}
</style></head><body class="iso"><figure class="card"><div class="head"><strong>Ripple tank</strong><output class="read" id="readout" aria-live="polite"></output></div><div class="stage" id="stage"></div><div class="controls"><label>Frequency <input id="frequency" type="range" min="2" max="8" value="4"></label><label>Spacing <input id="spacing" type="range" min="12" max="50" value="30"></label></div><p class="hint">Change frequency and source spacing</p><figcaption class="caption">Two dippers emit circular waves. Their overlap creates the familiar interference pattern; this compact model omits reflection and depth effects.</figcaption></figure><script type="module">
import { fitProjection, boxCorners, slabOf, cylinder, solidSvg, lineSvg, lineOnTop, ring, iso, figureSvg, ISO_CSS } from '/kits/iso.js';
const css = document.createElement('style');
css.textContent = ISO_CSS + \`.iso{--anatomy-page:var(--background);--anatomy-card:var(--card);--anatomy-text:var(--foreground);--anatomy-strong:var(--foreground);--anatomy-muted:var(--figure-label);--anatomy-paper:var(--card);--anatomy-face:var(--card);--anatomy-top:var(--secondary);--anatomy-shade-0:var(--muted);--anatomy-shade-1:var(--secondary);--anatomy-shade-2:var(--card);--anatomy-shade-3:var(--canvas);--anatomy-lit-top:var(--accent);--anatomy-lit-shade:var(--secondary);--anatomy-hi:var(--foreground);--anatomy-mid:var(--muted-foreground);--anatomy-lo:var(--border);--anatomy-faint:var(--canvas-grid);--anatomy-lit:var(--chart-1);--anatomy-halo:var(--foreground);--anatomy-halo-opacity:.08;--anatomy-dot:var(--foreground);--anatomy-red:var(--destructive);--anatomy-green:var(--chart-4);--anatomy-blue:var(--chart-2);--anatomy-weight:var(--stroke-hairline);--anatomy-mono:var(--font-mono);--anatomy-lift:none}\`;
document.head.append(css);
const base={x:-100,y:-55,w:200,d:110,r:6};
const P=fitProjection(boxCorners(base,-8,80),480,260,{pad:30});
const block=(p,z,h,tone='mid',lit=false)=>solidSvg(slabOf(p,z,h,P,6,0.7),{tone,lit});
const round=(x,y,r,z,h,tone='mid',lit=false)=>solidSvg(cylinder(x,y,r,z,h,P,28,0.5),{tone,lit});
const edge=(a,b,z,tone='lo')=>lineSvg(lineOnTop(a,b,z,P),{tone});
const feet=()=>[[-82,-40],[82,-40],[-82,40],[82,40]].map(([x,y])=>round(x,y,5,-8,3,'lo')).join('');
const foundation=()=>feet()+block(base,-5,5,'mid')+block({x:-88,y:-43,w:176,d:86,r:4},0,1,'faint');
const show=(body,label,readout)=>{document.getElementById('stage').innerHTML=figureSvg({width:480,height:260,label,body});document.getElementById('readout').textContent=readout};

const f=document.getElementById('frequency'),s=document.getElementById('spacing');
function draw(){const hz=Number(f.value),gap=Number(s.value);let b=foundation();
b+=block({x:-74,y:-39,w:148,d:78,r:2},2,5,'hi');
for(const y of [-gap/2,gap/2]){b+=round(-35,y,3,9,5,'lit',true);const [cx,cy]=iso([-35,y,9],P);for(let n=1;n<=4;n++)b+=\`<ellipse cx="\${cx}" cy="\${cy}" rx="\${n*11*4/hz}" ry="\${n*5*4/hz}" fill="none" stroke="var(--chart-2)" stroke-width="var(--stroke-hairline)" opacity="\${1-n*.17}"/>\`;}
show(b,'Ripple tank with two dippers and spreading wavefronts',\`\${hz} Hz · \${gap} mm apart\`);}
f.addEventListener('input',draw);s.addEventListener('input',draw);draw();
</script></body></html>
\`\`\`
`,
  },
  "anatomy-spot-plate": {
    id: "anatomy-spot-plate",
    title: "Spot plate example",
    description: "Six drop pairs merge as a feeler fan adjusts one shared threshold.",
    section: "visual-examples",
    path: "sections/visual-examples/anatomy-spot-plate.md",
    content: `---
name: anatomy-spot-plate
description: Six drop pairs merge as a feeler fan adjusts one shared threshold.
---

# Spot plate example

A compact Avenire-token adaptation of the corresponding Anatomy example. Load \`anatomy\`, \`style\`, and \`kit-api\` before adapting it. The example is standalone HTML for \`preview_widget\` then \`render_widget\`; explain the mechanism and the simplified model in prose.

\`\`\`html
<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>
*{box-sizing:border-box}body{margin:0;background:var(--background);color:var(--foreground);font-family:var(--font-sans)}
.card{border:var(--stroke-hairline) solid var(--figure-frame);border-radius:var(--radius);background:var(--card);padding:var(--space-4);max-width:700px;margin:auto}
.head{display:flex;align-items:baseline;justify-content:space-between;gap:var(--space-3);font-size:var(--text-sm)}
.head strong{font-size:var(--text-lg)}.read{font-family:var(--font-mono);font-size:var(--text-sm);color:var(--foreground)}
.hint,.caption{color:var(--muted-foreground);font-size:var(--text-sm);line-height:var(--leading-normal)}
.stage{min-height:260px;display:grid;place-items:center;margin:var(--space-3) 0}.stage svg{max-width:100%}
.controls{display:flex;gap:var(--space-3);align-items:center;flex-wrap:wrap}.controls label{display:flex;gap:var(--space-2);align-items:center;font-size:var(--text-sm)}
input[type=range]{width:min(250px,65vw);accent-color:var(--primary)}button,input[type=text]{font:inherit;border:var(--stroke-thin) solid var(--border);border-radius:calc(var(--radius) / 2);background:var(--secondary);color:var(--secondary-foreground);padding:var(--space-2)}
:focus-visible{outline:var(--stroke-emphasis) solid var(--ring);outline-offset:2px}
</style></head><body class="iso"><figure class="card"><div class="head"><strong>Spot plate</strong><output class="read" id="readout" aria-live="polite"></output></div><div class="stage" id="stage"></div><div class="controls"><label>Merge threshold <input id="merge" type="range" min="4" max="28" value="14"></label></div><p class="hint">Slide the merge threshold</p><figcaption class="caption">One threshold controls six pair states. Each close pair becomes a joined drop and its feeler blade opens.</figcaption></figure><script type="module">
import { fitProjection, boxCorners, slabOf, cylinder, solidSvg, lineSvg, lineOnTop, ring, iso, figureSvg, ISO_CSS } from '/kits/iso.js';
const css = document.createElement('style');
css.textContent = ISO_CSS + \`.iso{--anatomy-page:var(--background);--anatomy-card:var(--card);--anatomy-text:var(--foreground);--anatomy-strong:var(--foreground);--anatomy-muted:var(--figure-label);--anatomy-paper:var(--card);--anatomy-face:var(--card);--anatomy-top:var(--secondary);--anatomy-shade-0:var(--muted);--anatomy-shade-1:var(--secondary);--anatomy-shade-2:var(--card);--anatomy-shade-3:var(--canvas);--anatomy-lit-top:var(--accent);--anatomy-lit-shade:var(--secondary);--anatomy-hi:var(--foreground);--anatomy-mid:var(--muted-foreground);--anatomy-lo:var(--border);--anatomy-faint:var(--canvas-grid);--anatomy-lit:var(--chart-1);--anatomy-halo:var(--foreground);--anatomy-halo-opacity:.08;--anatomy-dot:var(--foreground);--anatomy-red:var(--destructive);--anatomy-green:var(--chart-4);--anatomy-blue:var(--chart-2);--anatomy-weight:var(--stroke-hairline);--anatomy-mono:var(--font-mono);--anatomy-lift:none}\`;
document.head.append(css);
const base={x:-100,y:-55,w:200,d:110,r:6};
const P=fitProjection(boxCorners(base,-8,80),480,260,{pad:30});
const block=(p,z,h,tone='mid',lit=false)=>solidSvg(slabOf(p,z,h,P,6,0.7),{tone,lit});
const round=(x,y,r,z,h,tone='mid',lit=false)=>solidSvg(cylinder(x,y,r,z,h,P,28,0.5),{tone,lit});
const edge=(a,b,z,tone='lo')=>lineSvg(lineOnTop(a,b,z,P),{tone});
const feet=()=>[[-82,-40],[82,-40],[-82,40],[82,40]].map(([x,y])=>round(x,y,5,-8,3,'lo')).join('');
const foundation=()=>feet()+block(base,-5,5,'mid')+block({x:-88,y:-43,w:176,d:86,r:4},0,1,'faint');
const show=(body,label,readout)=>{document.getElementById('stage').innerHTML=figureSvg({width:480,height:260,label,body});document.getElementById('readout').textContent=readout};

const merge=document.getElementById('merge');const gaps=[5,9,13,17,21,25];
function draw(){const threshold=Number(merge.value);let b=foundation();let joined=0;
for(let i=0;i<6;i++){const x=-72+i*28,y=4,g=gaps[i],hit=g<=threshold;if(hit)joined++;
b+=block({x:x-10,y:-30,w:20,d:50,r:2},1,3,'lo');
if(hit)b+=round(x,y,6+g*.12,5,2,'lit',true);else{b+=round(x-g*.24,y,5,5,2,'mid')+round(x+g*.24,y,5,5,2,'mid');}
b+=edge([x,-30],[x,-30+(hit?18:8)],5,hit?'lit':'lo');}
show(b,'Spot plate with six drop pairs and feeler blades',\`\${joined} of 6 joined · \${threshold} px threshold\`);}
merge.addEventListener('input',draw);draw();
</script></body></html>
\`\`\`
`,
  },
  "anatomy-test-rig": {
    id: "anatomy-test-rig",
    title: "Press and pull test rig example",
    description: "A spring-mounted glass button responds to press and sideways pull with a gauge readout.",
    section: "visual-examples",
    path: "sections/visual-examples/anatomy-test-rig.md",
    content: `---
name: anatomy-test-rig
description: A spring-mounted glass button responds to press and sideways pull with a gauge readout.
---

# Press and pull test rig example

A compact Avenire-token adaptation of the corresponding Anatomy example. Load \`anatomy\`, \`style\`, and \`kit-api\` before adapting it. The example is standalone HTML for \`preview_widget\` then \`render_widget\`; explain the mechanism and the simplified model in prose.

\`\`\`html
<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>
*{box-sizing:border-box}body{margin:0;background:var(--background);color:var(--foreground);font-family:var(--font-sans)}
.card{border:var(--stroke-hairline) solid var(--figure-frame);border-radius:var(--radius);background:var(--card);padding:var(--space-4);max-width:700px;margin:auto}
.head{display:flex;align-items:baseline;justify-content:space-between;gap:var(--space-3);font-size:var(--text-sm)}
.head strong{font-size:var(--text-lg)}.read{font-family:var(--font-mono);font-size:var(--text-sm);color:var(--foreground)}
.hint,.caption{color:var(--muted-foreground);font-size:var(--text-sm);line-height:var(--leading-normal)}
.stage{min-height:260px;display:grid;place-items:center;margin:var(--space-3) 0}.stage svg{max-width:100%}
.controls{display:flex;gap:var(--space-3);align-items:center;flex-wrap:wrap}.controls label{display:flex;gap:var(--space-2);align-items:center;font-size:var(--text-sm)}
input[type=range]{width:min(250px,65vw);accent-color:var(--primary)}button,input[type=text]{font:inherit;border:var(--stroke-thin) solid var(--border);border-radius:calc(var(--radius) / 2);background:var(--secondary);color:var(--secondary-foreground);padding:var(--space-2)}
:focus-visible{outline:var(--stroke-emphasis) solid var(--ring);outline-offset:2px}
</style></head><body class="iso"><figure class="card"><div class="head"><strong>Press and pull test rig</strong><output class="read" id="readout" aria-live="polite"></output></div><div class="stage" id="stage"></div><div class="controls"><button id="press" type="button">Press</button><label>Pull <input id="pull" type="range" min="-80" max="80" value="0"></label></div><p class="hint">Press, then pull the probe sideways</p><figcaption class="caption">A simplified spring response: the held probe displaces the glass carriage, and the gauge reports its lean.</figcaption></figure><script type="module">
import { fitProjection, boxCorners, slabOf, cylinder, solidSvg, lineSvg, lineOnTop, ring, iso, figureSvg, ISO_CSS } from '/kits/iso.js';
const css = document.createElement('style');
css.textContent = ISO_CSS + \`.iso{--anatomy-page:var(--background);--anatomy-card:var(--card);--anatomy-text:var(--foreground);--anatomy-strong:var(--foreground);--anatomy-muted:var(--figure-label);--anatomy-paper:var(--card);--anatomy-face:var(--card);--anatomy-top:var(--secondary);--anatomy-shade-0:var(--muted);--anatomy-shade-1:var(--secondary);--anatomy-shade-2:var(--card);--anatomy-shade-3:var(--canvas);--anatomy-lit-top:var(--accent);--anatomy-lit-shade:var(--secondary);--anatomy-hi:var(--foreground);--anatomy-mid:var(--muted-foreground);--anatomy-lo:var(--border);--anatomy-faint:var(--canvas-grid);--anatomy-lit:var(--chart-1);--anatomy-halo:var(--foreground);--anatomy-halo-opacity:.08;--anatomy-dot:var(--foreground);--anatomy-red:var(--destructive);--anatomy-green:var(--chart-4);--anatomy-blue:var(--chart-2);--anatomy-weight:var(--stroke-hairline);--anatomy-mono:var(--font-mono);--anatomy-lift:none}\`;
document.head.append(css);
const base={x:-100,y:-55,w:200,d:110,r:6};
const P=fitProjection(boxCorners(base,-8,80),480,260,{pad:30});
const block=(p,z,h,tone='mid',lit=false)=>solidSvg(slabOf(p,z,h,P,6,0.7),{tone,lit});
const round=(x,y,r,z,h,tone='mid',lit=false)=>solidSvg(cylinder(x,y,r,z,h,P,28,0.5),{tone,lit});
const edge=(a,b,z,tone='lo')=>lineSvg(lineOnTop(a,b,z,P),{tone});
const feet=()=>[[-82,-40],[82,-40],[-82,40],[82,40]].map(([x,y])=>round(x,y,5,-8,3,'lo')).join('');
const foundation=()=>feet()+block(base,-5,5,'mid')+block({x:-88,y:-43,w:176,d:86,r:4},0,1,'faint');
const show=(body,label,readout)=>{document.getElementById('stage').innerHTML=figureSvg({width:480,height:260,label,body});document.getElementById('readout').textContent=readout};

let held=false;const pull=document.getElementById('pull');
function draw(){const px=held?Number(pull.value):0,lean=Math.round(px*.16*10)/10;let b=foundation();
for(const y of [-22,22])b+=block({x:-65,y:y-2,w:126,d:4,r:1},2,4,'mid');
b+=block({x:-28+lean,y:-31,w:56,d:62,r:3},7,5,held?'lit':'hi',held);
b+=round(60,-25,14,16,6,'mid');
b+=edge([60,-25],[60+lean,-25],23,'lit');
b+=block({x:-82,y:-4,w:25,d:8,r:1},14,6,'mid');
show(b,'Spring carriage, finger probe and dial gauge',\`\${held?'pressed':'released'} · lean \${lean.toFixed(1)} mm\`);}
pull.addEventListener('input',draw);document.getElementById('press').addEventListener('click',e=>{held=!held;e.currentTarget.textContent=held?'Release':'Press';draw()});draw();
</script></body></html>
\`\`\`
`,
  },
  "anatomy-turning-dial": {
    id: "anatomy-turning-dial",
    title: "Turning dial example",
    description: "A turning combination dial carries a small hand and a detachable pod.",
    section: "visual-examples",
    path: "sections/visual-examples/anatomy-turning-dial.md",
    content: `---
name: anatomy-turning-dial
description: A turning combination dial carries a small hand and a detachable pod.
---

# Turning dial example

A compact Avenire-token adaptation of the corresponding Anatomy example. Load \`anatomy\`, \`style\`, and \`kit-api\` before adapting it. The example is standalone HTML for \`preview_widget\` then \`render_widget\`; explain the mechanism and the simplified model in prose.

\`\`\`html
<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>
*{box-sizing:border-box}body{margin:0;background:var(--background);color:var(--foreground);font-family:var(--font-sans)}
.card{border:var(--stroke-hairline) solid var(--figure-frame);border-radius:var(--radius);background:var(--card);padding:var(--space-4);max-width:700px;margin:auto}
.head{display:flex;align-items:baseline;justify-content:space-between;gap:var(--space-3);font-size:var(--text-sm)}
.head strong{font-size:var(--text-lg)}.read{font-family:var(--font-mono);font-size:var(--text-sm);color:var(--foreground)}
.hint,.caption{color:var(--muted-foreground);font-size:var(--text-sm);line-height:var(--leading-normal)}
.stage{min-height:260px;display:grid;place-items:center;margin:var(--space-3) 0}.stage svg{max-width:100%}
.controls{display:flex;gap:var(--space-3);align-items:center;flex-wrap:wrap}.controls label{display:flex;gap:var(--space-2);align-items:center;font-size:var(--text-sm)}
input[type=range]{width:min(250px,65vw);accent-color:var(--primary)}button,input[type=text]{font:inherit;border:var(--stroke-thin) solid var(--border);border-radius:calc(var(--radius) / 2);background:var(--secondary);color:var(--secondary-foreground);padding:var(--space-2)}
:focus-visible{outline:var(--stroke-emphasis) solid var(--ring);outline-offset:2px}
</style></head><body class="iso"><figure class="card"><div class="head"><strong>Turning dial</strong><output class="read" id="readout" aria-live="polite"></output></div><div class="stage" id="stage"></div><div class="controls"><label>Dial <input id="angle" type="range" min="0" max="360" value="0"></label><button id="pod" type="button">Detach pod</button></div><p class="hint">Turn the dial; detach the pod</p><figcaption class="caption">The pointer and hand rotate from one angle. The pod can detach; a real assembly would need a joint and clearance audit.</figcaption></figure><script type="module">
import { fitProjection, boxCorners, slabOf, cylinder, solidSvg, lineSvg, lineOnTop, ring, iso, figureSvg, ISO_CSS } from '/kits/iso.js';
const css = document.createElement('style');
css.textContent = ISO_CSS + \`.iso{--anatomy-page:var(--background);--anatomy-card:var(--card);--anatomy-text:var(--foreground);--anatomy-strong:var(--foreground);--anatomy-muted:var(--figure-label);--anatomy-paper:var(--card);--anatomy-face:var(--card);--anatomy-top:var(--secondary);--anatomy-shade-0:var(--muted);--anatomy-shade-1:var(--secondary);--anatomy-shade-2:var(--card);--anatomy-shade-3:var(--canvas);--anatomy-lit-top:var(--accent);--anatomy-lit-shade:var(--secondary);--anatomy-hi:var(--foreground);--anatomy-mid:var(--muted-foreground);--anatomy-lo:var(--border);--anatomy-faint:var(--canvas-grid);--anatomy-lit:var(--chart-1);--anatomy-halo:var(--foreground);--anatomy-halo-opacity:.08;--anatomy-dot:var(--foreground);--anatomy-red:var(--destructive);--anatomy-green:var(--chart-4);--anatomy-blue:var(--chart-2);--anatomy-weight:var(--stroke-hairline);--anatomy-mono:var(--font-mono);--anatomy-lift:none}\`;
document.head.append(css);
const base={x:-100,y:-55,w:200,d:110,r:6};
const P=fitProjection(boxCorners(base,-8,80),480,260,{pad:30});
const block=(p,z,h,tone='mid',lit=false)=>solidSvg(slabOf(p,z,h,P,6,0.7),{tone,lit});
const round=(x,y,r,z,h,tone='mid',lit=false)=>solidSvg(cylinder(x,y,r,z,h,P,28,0.5),{tone,lit});
const edge=(a,b,z,tone='lo')=>lineSvg(lineOnTop(a,b,z,P),{tone});
const feet=()=>[[-82,-40],[82,-40],[-82,40],[82,40]].map(([x,y])=>round(x,y,5,-8,3,'lo')).join('');
const foundation=()=>feet()+block(base,-5,5,'mid')+block({x:-88,y:-43,w:176,d:86,r:4},0,1,'faint');
const show=(body,label,readout)=>{document.getElementById('stage').innerHTML=figureSvg({width:480,height:260,label,body});document.getElementById('readout').textContent=readout};

let detached=false;const angle=document.getElementById('angle');
function draw(){const a=Number(angle.value)*Math.PI/180;let b=foundation();
b+=round(0,0,38,4,8,'hi');b+=lineSvg(ring(0,0,31,13,P,60),{tone:'lo'});
for(let i=0;i<12;i++){const t=i*Math.PI/6;b+=edge([30*Math.cos(t),30*Math.sin(t)],[36*Math.cos(t),36*Math.sin(t)],13,'lo');}
b+=round(0,0,8,13,4,'lit',true);
b+=edge([0,0],[27*Math.cos(a),27*Math.sin(a)],18,'lit');
const handX=18*Math.cos(a),handY=18*Math.sin(a);b+=round(handX,handY,5,18,6,'mid');
b+=block({x:handX-3,y:handY-2,w:20,d:4,r:1},24,3,'hi');
b+=round(detached?70:handX+20,detached?30:handY,5,20,6,detached?'lo':'lit',!detached);
show(b,'Combination dial with a rotating hand and detachable pod',\`\${Math.round(Number(angle.value)/3.6)%100} · \${detached?'pod detached':'pod attached'}\`);}
angle.addEventListener('input',draw);document.getElementById('pod').addEventListener('click',e=>{detached=!detached;e.currentTarget.textContent=detached?'Attach pod':'Detach pod';draw()});draw();
</script></body></html>
\`\`\`
`,
  },
  "chart-comparison": {
    id: "chart-comparison",
    title: "Comparison chart example",
    description: "Show v1 versus v2 metrics as plain grouped SVG bars with labelled deltas and a shared zero scale.",
    section: "visual-examples",
    path: "sections/visual-examples/chart-comparison.md",
    content: `---
name: chart-comparison
description: Show v1 versus v2 metrics as plain grouped SVG bars with labelled deltas and a shared zero scale.
---

# Comparison chart example

Use actual source values in place of these labelled demonstration values. The default is a direct chart, with a thin-line card and one useful annotation. Preview at 390 px and both themes before rendering.

\`\`\`html
<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>
body{margin:0;font:var(--text-base)/var(--leading-normal) var(--font-sans);color:var(--foreground)}
figure{margin:auto;max-width:700px;padding:var(--space-4);background:var(--card);border:var(--stroke-hairline) solid var(--figure-frame);border-radius:var(--radius)}
h2{margin:0;font-size:var(--text-lg)}p{margin:var(--space-2) 0 0;color:var(--muted-foreground);font-size:var(--text-sm)}figcaption{font-size:var(--text-sm);color:var(--muted-foreground)}
svg{display:block;width:100%;height:auto;margin-top:var(--space-3)}.axis{stroke:var(--figure-leader);stroke-width:var(--stroke-hairline)}
.tick{fill:var(--figure-label);font-size:calc(var(--figure-label-size)*1.3);font-family:var(--font-sans)}.value{fill:var(--foreground);font-size:calc(var(--figure-label-size)*1.3);font-family:var(--font-mono)}
</style></head><body><figure><h2>v1 and v2 · example metrics</h2><p>Demonstration values, units in percent. Replace with measured data.</p><svg id="plot" viewBox="0 0 480 285" role="img" aria-label="Grouped bars comparing v1 and v2 on recall and accuracy"></svg><figcaption id="caption"></figcaption></figure>
<script type="module">
const data=[{label:'Recall',unit:'%',v1:64,v2:76},{label:'Accuracy',unit:'%',v1:71,v2:74}];
const svg=document.getElementById('plot'), ns='http://www.w3.org/2000/svg';
function add(tag,attrs,text){const el=document.createElementNS(ns,tag);for(const [k,v] of Object.entries(attrs))el.setAttribute(k,String(v));if(text!==undefined)el.textContent=text;svg.append(el);return el}
const top=28,bottom=225,left=54,right=448,y=v=>bottom-v/100*(bottom-top);
for(let t=0;t<=100;t+=25){add('line',{x1:left,x2:right,y1:y(t),y2:y(t),class:'axis'});add('text',{x:left-10,y:y(t)+4,'text-anchor':'end',class:'tick'},\`\${t}%\`)}
data.forEach((d,i)=>{const cx=158+i*184;
  for(const [j,key] of ['v1','v2'].entries()){const x=cx-42+j*43,v=d[key];add('rect',{x,y:y(v),width:34,height:bottom-y(v),fill:\`var(--chart-\${j+1})\`});add('text',{x:x+17,y:y(v)-6,'text-anchor':'middle',class:'value'},\`\${v}%\`)}
  add('text',{x:cx-4,y:bottom+22,'text-anchor':'middle',class:'tick'},d.label);
  add('text',{x:cx-4,y:bottom+41,'text-anchor':'middle',class:'value'},\`+\${d.v2-d.v1} pp\`);
});
add('text',{x:175,y:18,class:'tick'},'v1');add('rect',{x:157,y:8,width:11,height:11,fill:'var(--chart-1)'});
add('text',{x:236,y:18,class:'tick'},'v2');add('rect',{x:218,y:8,width:11,height:11,fill:'var(--chart-2)'});
document.getElementById('caption').textContent='Recall improves by 12 percentage points; accuracy by 3 percentage points.';
</script></body></html>
\`\`\`
`,
  },
  "chart-from-spreadsheet": {
    id: "chart-from-spreadsheet",
    title: "Spreadsheet trend example",
    description: "Read a spreadsheet with pandas, aggregate a dated series, embed JSON, and draw a plain SVG trend.",
    section: "visual-examples",
    path: "sections/visual-examples/chart-from-spreadsheet.md",
    content: `---
name: chart-from-spreadsheet
description: Read a spreadsheet with pandas, aggregate a dated series, embed JSON, and draw a plain SVG trend.
---

# Spreadsheet trend example

In the sandbox, inspect columns before choosing the date and value fields. This illustrative command works for a sheet with \`date\` and \`value\` columns; use the real source's names and units. Replace the embedded demonstration JSON with the printed aggregate, then preview the widget.

\`\`\`python
import json
import pandas as pd
rows = pd.read_excel('source.xlsx', engine='openpyxl')
print(rows.dtypes.to_string())
rows['date'] = pd.to_datetime(rows['date'], errors='coerce')
rows['value'] = pd.to_numeric(rows['value'], errors='coerce')
rows = rows.dropna(subset=['date','value'])
monthly = rows.groupby(rows['date'].dt.to_period('M'))['value'].mean().reset_index()
monthly['date'] = monthly['date'].astype(str)
print(json.dumps(monthly.to_dict(orient='records'), separators=(',',':')))
\`\`\`

\`\`\`html
<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>
body{margin:0;font:var(--text-base)/var(--leading-normal) var(--font-sans);color:var(--foreground)}
figure{margin:auto;max-width:700px;padding:var(--space-4);border:var(--stroke-hairline) solid var(--figure-frame);border-radius:var(--radius);background:var(--card)}
h2{margin:0;font-size:var(--text-lg)}p,figcaption{font-size:var(--text-sm);color:var(--muted-foreground)}
svg{width:100%;height:auto;display:block}.rule{stroke:var(--figure-leader);stroke-width:var(--stroke-hairline)}
.label{fill:var(--figure-label);font:calc(var(--figure-label-size)*1.3) var(--font-sans)}
</style></head><body><figure><h2>Monthly average · example index</h2><p>Index units. Replace the embedded values and unit with the spreadsheet aggregate.</p><svg id="plot" viewBox="0 0 480 260" role="img" aria-label="Monthly trend in index units"></svg><figcaption id="caption"></figcaption></figure>
<script type="module">
const rows=[{"date":"2026-01","value":21},{"date":"2026-02","value":24},{"date":"2026-03","value":22},{"date":"2026-04","value":29}];
const svg=document.getElementById('plot'),ns='http://www.w3.org/2000/svg';
function add(tag,attrs,text){const e=document.createElementNS(ns,tag);for(const [k,v] of Object.entries(attrs))e.setAttribute(k,String(v));if(text!==undefined)e.textContent=text;svg.append(e)}
const values=rows.map(r=>r.value),min=Math.floor(Math.min(0,...values)/10)*10,max=Math.ceil(Math.max(...values)/10)*10||10;
const X=i=>50+i*390/Math.max(1,rows.length-1),Y=v=>210-(v-min)/(max-min)*160;
for(let v=min;v<=max;v+=10){add('line',{x1:50,x2:440,y1:Y(v),y2:Y(v),class:'rule'});add('text',{x:42,y:Y(v)+4,'text-anchor':'end',class:'label'},String(v))}
const line=rows.map((r,i)=>\`\${i?'L':'M'}\${X(i)} \${Y(r.value)}\`).join(' ');
add('path',{d:line,fill:'none',stroke:'var(--chart-1)','stroke-width':'var(--stroke-regular)','stroke-linejoin':'round'});
rows.forEach((r,i)=>{add('circle',{cx:X(i),cy:Y(r.value),r:3,fill:'var(--chart-1)'});add('text',{x:X(i),y:234,'text-anchor':'middle',class:'label'},r.date.slice(5))});
document.getElementById('caption').textContent=\`From \${rows[0].value} to \${rows.at(-1).value} over \${rows.length} months (demonstration values).\`;
</script></body></html>
\`\`\`
`,
  },
  "sim-double-pendulum": {
    id: "sim-double-pendulum",
    title: "Double pendulum example",
    description: "Run a two-link pendulum with math.js RK4, a fixed-step loop, pause control, and energy readout.",
    section: "visual-examples",
    path: "sections/visual-examples/sim-double-pendulum.md",
    content: `---
name: sim-double-pendulum
description: Run a two-link pendulum with math.js RK4, a fixed-step loop, pause control, and energy readout.
---

# Double pendulum example

This shows a sensitive dynamical system without adding an elaborate machine. The readout and the drawn rods use one state. Load \`simulation\`, \`style\`, and \`kit-api\`; preview start, pause, and slider reset.

\`\`\`html
<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>
body{margin:0;font:var(--text-base)/var(--leading-normal) var(--font-sans);color:var(--foreground)}
figure{margin:auto;max-width:700px;padding:var(--space-4);border:var(--stroke-hairline) solid var(--figure-frame);border-radius:var(--radius);background:var(--card)}
h2{margin:0;font-size:var(--text-lg)}p{color:var(--muted-foreground);font-size:var(--text-sm)}
svg{width:100%;height:auto;display:block;background:var(--canvas);border-radius:var(--radius)}.rod{stroke:var(--foreground);stroke-width:var(--stroke-regular)}
.controls{display:flex;gap:var(--space-4);align-items:center;flex-wrap:wrap;margin-top:var(--space-3)}button{font:inherit;padding:var(--space-2);color:var(--secondary-foreground);background:var(--secondary);border:var(--stroke-thin) solid var(--border);border-radius:var(--radius)}
input{accent-color:var(--primary)}:focus-visible{outline:var(--stroke-emphasis) solid var(--ring);outline-offset:2px}output{font:var(--text-sm) var(--font-mono)}
</style></head><body><figure><h2>Double pendulum</h2><p>Change the first starting angle to reset the motion.</p><svg viewBox="0 0 440 300" role="img" aria-label="Two linked pendulum rods"><line id="a" class="rod"/><line id="b" class="rod"/><circle cx="220" cy="68" r="4" fill="var(--foreground)"/><circle id="bob1" r="7" fill="var(--chart-1)"/><circle id="bob2" r="9" fill="var(--chart-2)"/></svg><div class="controls"><label>Start angle <input id="angle" type="range" min="20" max="140" value="90">°</label><button id="toggle" type="button">Pause</button><output id="energy"></output></div><p>Model: two equal masses and lengths, no damping. Energy is in normalized units.</p></figure>
<script type="module">
import { doublePendulum, rk4Step, createRk4Workspace } from '/kits/math.js';
const angle=document.getElementById('angle'),toggle=document.getElementById('toggle'),out=document.getElementById('energy');
let system,state,work,t=0,last=0,acc=0,visible=true,playing=!matchMedia('(prefers-reduced-motion: reduce)').matches;
new IntersectionObserver(([entry])=>{visible=entry.isIntersecting;last=0}).observe(document.querySelector('figure'));
function reset(){system=doublePendulum({theta1:Number(angle.value)*Math.PI/180,theta2:0.35});state=system.initial;work=createRk4Workspace(state.length);t=0;acc=0;draw()}
function draw(){const [a,b,w1,w2]=state,x1=220+90*Math.sin(a),y1=68+90*Math.cos(a),x2=x1+90*Math.sin(b),y2=y1+90*Math.cos(b);
const set=(id,attrs)=>{const e=document.getElementById(id);for(const [k,v] of Object.entries(attrs))e.setAttribute(k,String(v))};
set('a',{x1:220,y1:68,x2:x1,y2:y1});set('b',{x1,y1,x2,y2});set('bob1',{cx:x1,cy:y1});set('bob2',{cx:x2,cy:y2});
const kinetic=.5*(2*w1*w1+w2*w2+2*w1*w2*Math.cos(a-b));const potential=-9.81*(2*Math.cos(a)+Math.cos(b));
out.textContent=\`t \${t.toFixed(1)} s · energy \${(kinetic+potential).toFixed(2)}\`;}
angle.addEventListener('input',reset);toggle.addEventListener('click',()=>{playing=!playing;toggle.textContent=playing?'Pause':'Play';last=0});
document.addEventListener('visibilitychange',()=>{last=0});
function frame(now){if(playing&&!document.hidden&&visible){const dt=last?Math.min((now-last)/1000,.05):0;acc+=dt;let steps=0;while(acc>=1/120&&steps++<7){state=rk4Step(system.derivative,t,state,1/120,undefined,work);t+=1/120;acc-=1/120}if(steps>7)acc=0;draw()}last=now;requestAnimationFrame(frame)}
reset();if(!playing)toggle.textContent='Play';requestAnimationFrame(frame);
</script></body></html>
\`\`\`
`,
  },
  "anatomy-3d": {
    id: "anatomy-3d",
    title: "Anatomy depth and WebGL",
    description: "Use true depth rotation or a restrained WebGL layer only when anatomy's explanation requires it.",
    section: "visual-guidelines",
    path: "sections/visual-guidelines/anatomy-3d.md",
    content: `---
name: anatomy-3d
description: Use true depth rotation or a restrained WebGL layer only when anatomy's explanation requires it.
---

# Anatomy depth and WebGL

A static isometric SVG is enough for most anatomy widgets. Use 3D only when turning in depth, a hinge, or a detachable body *is* the explanation. \`/kits/iso.js\` supplies projection, depth (\`depthOf\`), solid paths, \`lathe\` and \`tube\`; \`/kits/iso-gl.js\` supplies \`glCamera(P)\`, \`glLayer(...)\`, \`GLSL_ISO\`, \`GLSL_TURN\`, \`glslPose\`, \`smooth\`, \`burst\` and \`settle\`. Load \`kit-api\` for the exact API. A simple turning dial can instead reproject a small handful of parts each frame with an updated projection azimuth, then depth-sort by \`depthOf\`; avoid a dense live 3D scene for a simple control.

Keep static clutter fixed and turn one small subject. Move mounts and children together. Split parts at occlusion boundaries and draw back/phenomenon/front layers in that order. Every tube ends on an actual port and keeps clearance from solids. An effect belongs in world coordinates tied to the same camera as the SVG, not an unrelated screen-space overlay. Fade uniforms in/out; make every term reach zero before canvas edges, and offer a static SVG fallback when WebGL is absent. Re-read theme tokens on \`avenire:themechange\`, redraw, and cap device pixel ratio and work per frame. Reduced motion gets a still frame.

Preview at several angles (including 0°, side and near-overlap), at phone width, in both themes. Look for depth inversions, disappearing contacts, a shader crossing a foreground line, and parts that jump at wraparound. Use \`preview_widget\` screenshots/console rather than anatomy's local Node audit scripts. If geometry is very dense, simplify the mechanism or publish a short manimgx video through \`sandbox\`.
`,
  },
  "anatomy-craft": {
    id: "anatomy-craft",
    title: "Anatomy craft",
    description: "Construct convincing thin-line isometric parts, card composition, and depth order with the iso kit.",
    section: "visual-guidelines",
    path: "sections/visual-guidelines/anatomy-craft.md",
    content: `---
name: anatomy-craft
description: Construct convincing thin-line isometric parts, card composition, and depth order with the iso kit.
---

# Anatomy craft

Begin with the physical parts list and their mounts. Put a thick base on feet, a rail or post, a moving subject, one measuring feature, and restrained hardware where it would actually hold something. Draw from back to front. \`fitProjection(boxCorners(plan,z0,z1),width,height,{pad})\` fits the *extremes*; include moving extremes too. \`slabOf(plan,z,h,P,steps,bevel)\` and \`cylinder(cx,cy,r,z,h,P,steps,bevel)\` return paths for \`solidSvg(paths,{tone,crease,lit,inner})\`. Use \`planOutline\` and \`sideSeam\` for lines that finish on the silhouette; \`ring\`, \`radialTicks\`, \`knurl\` for dials; \`coil\` for springs; \`lathe\` and \`tube\` only when actual round bodies or pipes carry meaning. Verify signatures in \`kit-api\` and \`iso-kit.ts\`.

\`\`\`
back: floor halo, feet, far rail/post
middle: base, support, behind-the-subject spring or cable
front: carriage, subject, pointer, near guard, labels
\`\`\`

A solid has thickness, a brighter top, darker sides and a fine visible outline. Keep most parts neutral and one part lit. A fastener sits on a flange, never floats. A spring wraps a rod in two halves; draw \`coil(...).back\`, the rod, then \`.front\`. A seam ends on a true edge or fades; no detached ticks on an empty plate. On a cabinet, make a cutaway physically open so the viewer can follow the chute or cable. A pipe ends on a port or connector; crossings get clear depth order. A screen's content stays clipped to its glass and follows the face plane. At 390 px, the main object should still read; at 4×, missing joints and bad contacts should become obvious.

Use a framed card (\`--figure-frame\`, \`--card\`) with a small title, hint and readout. Reserve about 55–65% of its stage for the instrument. Place labels in the margins; short \`--figure-leader\` lines may point to parts, but the geometry itself should do the teaching. Avoid a forest of annotation lines. Prefer SVG for linework. A single Canvas or WebGL layer is justified for phenomena lines cannot draw (water, light, exhaust), between a back SVG and front SVG, using the same projection and a static SVG fallback. For light theme, draw ink on paper; don't reuse a dark glow through blend modes.
`,
  },
  "anatomy-motion": {
    id: "anatomy-motion",
    title: "Anatomy motion",
    description: "Drive anatomy figures with a small truthful model, calm input response, and accessible controls.",
    section: "visual-guidelines",
    path: "sections/visual-guidelines/anatomy-motion.md",
    content: `---
name: anatomy-motion
description: Drive anatomy figures with a small truthful model, calm input response, and accessible controls.
---

# Anatomy motion

Use one state model for pose, labels, readout and caption. Treat pointer and keyboard as ways to set the *same* target. Ease the displayed state with \`shown += (target-shown)*(1-Math.exp(-dt/0.12))\`; clamp \`dt\` after tab inactivity. For physics use the \`simulation\` skill and math kit instead. Start from a legible settled pose, move only parts whose motion teaches the idea, and stop scheduling frames once motion settles. Pause when hidden or outside the viewport. Reduced motion should jump to the target state and keep controls usable.

Use native \`<input type="range">\` or buttons for the primary control. A draggable stage needs \`tabindex="0"\`, an appropriate \`role="slider"\`, \`aria-valuemin/max/now\`, a concise \`aria-valuetext\`, Arrow/Home/End handling, and visible focus. Call \`setPointerCapture\` on a *real* pointerdown only; release it on pointerup/cancel. If a demonstration tour exists, stop it at the first user action and do not fight the user. Speak discrete meaningful changes through an \`aria-live="polite"\` text node, not every frame. Keep all controls reachable at phone width.

Animate an exploded view only if it reveals the path of assembly or a hidden causal chain. Stagger parts so the outside leaves first, keep every connector attached to the moving group or show an intentional unplug, and check intermediate states. For one-shot light, use attack and decay envelopes; no abrupt phase or colour switch. Any shader should ease its uniforms and render only while active.

After writing HTML, call \`preview_widget\` at start, midpoint and endpoint; inspect the console, readout, clipping, focus and both themes. Test pointer and keyboard actions. Render only after the object and number agree.
`,
  },
  "anatomy": {
    id: "anatomy",
    title: "Anatomy figure",
    description: "Explain a concept as a small working physical object when a mechanism or analogy teaches more than a chart.",
    section: "visual-guidelines",
    path: "sections/visual-guidelines/anatomy.md",
    content: `---
name: anatomy
description: Explain a concept as a small working physical object when a mechanism or analogy teaches more than a chart.
---

# Anatomy figure

Use this option when the question is about *how* parts cooperate or a state propagates and a physical mechanism maps cleanly to the idea. A lock can explain cache validity, a gauge can explain feedback, and a ripple tank can explain interference. Use a plain chart for ordinary comparisons and trends, and a simple simulation for direct parameter exploration. Do not turn “v1 versus v2 stats” into a machine.

Write one sentence before drawing: “As **X** changes, **part A** moves, causing **part B** to indicate **Y**.” Check that this is truthful. Build a small pure model returning pose and readout from the same state. Invent a recognizable instrument with base, supports, the thing that moves, a scale, controls and a few true fasteners; do not draw labelled boxes with arbitrary arrows. Every small part needs a mount or joint. Keep one focal colour (\`--chart-1\`), quiet neutral solids, and fine lines per \`style\`. A card can show a title, hint, readout and short caption. Consult \`anatomy-craft\` for geometry, \`anatomy-motion\` for interaction, and \`anatomy-3d\` only if actual depth rotation matters.

For SVG isometric work, import \`/kits/iso.js\`; load \`kit-api\` for exact signatures. A minimal construction:

\`\`\`html
<div id="figure" aria-label="Isometric indicator with a raised base"></div>
<script type="module">
import { fitProjection, boxCorners, slabOf, solidSvg, figureSvg, ISO_CSS } from '/kits/iso.js';
const s = document.createElement('style'); s.textContent = ISO_CSS; document.head.append(s);
const base = { x:0, y:0, w:80, d:50, r:5 };
const P = fitProjection(boxCorners(base,0,10),400,250);
document.getElementById('figure').innerHTML = figureSvg({ width:400, height:250, label:'Raised indicator base',
  body:solidSvg(slabOf(base,0,10,P,8,1),{tone:'mid'}) });
</script>
\`\`\`

The host provides theme variables, but the kit's \`ISO_CSS\` uses its own \`--anatomy-*\` vars. Override those variables on \`.iso-figure\`/\`.iso-svg\` from Avenire tokens before using kit markup (see the examples); do not ship the source palette. When only a few paths are needed, style the returned SVG markup directly with Avenire variables.

Build the static pose first, then add the control. Reserve height and include a clear fallback state. Check 1× and 4× for floating ends, impossible overlaps and misleading labels. Use \`preview_widget\` at the actual page width and in both appearances; inspect console and screenshot after input. Explain the analogy and its limits in chat prose. Anatomy source: MIT, wheresryan22.
`,
  },
  "chart": {
    id: "chart",
    title: "Chart",
    description: "Draw correct, restrained hand-written SVG charts for comparisons, trends, distributions, and relationships.",
    section: "visual-guidelines",
    path: "sections/visual-guidelines/chart.md",
    content: `---
name: chart
description: Draw correct, restrained hand-written SVG charts for comparisons, trends, distributions, and relationships.
---

# Chart

Default to a plain chart. Use hand-written SVG and embedded computed JSON, with no chart library. Call \`get_page_context\`, load \`style\`, preview with \`preview_widget\`, then \`render_widget\`. Start from a question, identify the relevant fields and units, and do not invent observations.

| Question | Marks and scale |
| --- | --- |
| One value per category | Bar from zero; sort only if order is not meaningful |
| v1 versus v2 or several cohorts | Grouped bars with shared zero baseline; annotate delta in units and percent (if baseline nonzero) |
| Values over time | Line with true ordered dates and gaps for missing values; use area only when zero baseline and magnitude matter |
| Relation between two measures | Scatter; optional fit line using \`linearRegression\` from \`kit-api\`; say what was fitted, never imply causation |
| Frequency distribution | Histogram of equal-width bins; show count or density and bin width |
| Several comparable subgroups | Small multiples with the **same scale** and axes, unless clearly labelled otherwise |

For a numeric axis, compute a “nice” step from \`10^floor(log10(range/targetTicks)) × {1,2,5,10}\`. Round domain outward; include zero for bars and area. Map y with \`bottom - (value - min)/(max - min) * plotHeight\`; guard equal min/max. Render 3–6 ticks with units and localized formatting (\`Intl.NumberFormat\`). Keep date spacing proportional to time unless the data are categories. Never silently connect across nulls or truncate an axis to dramatize a change. Use sufficient margins for tick labels, then measure the narrow preview.

Use \`--chart-1\` through \`--chart-6\` in order, \`--stroke-regular\` for data lines, \`--stroke-hairline\` and \`--figure-leader\` for axes and rules, \`--figure-label\` and \`--figure-label-size\` for ticks, and \`--figure-frame\` for the card. No gradient is needed for ordinary charts. Label each line directly at its end when possible; use a legend for crowded lines or grouped bars. Pair colour with text, point shape, or dash. Annotate the one comparison or inflection that answers the question; keep annotation lines thin. Include a short caption or accessible table with precise values. Explain the takeaway in chat prose, with denominator and uncertainty if relevant.

## Data workflow

Use the user's supplied numbers, search/read tools for cited sources, or the sandbox for CSV/XLSX. In the sandbox, inspect columns and missing values with pandas, parse dates and numeric fields explicitly, compute aggregates there, and print compact JSON. Embed that JSON literal in the HTML; never use \`fetch\` in the widget. See \`chart-from-spreadsheet\` for a complete example. If there are many thousands of marks, if the user needs a static export, or if frame-by-frame animation is the point, draw with matplotlib and \`publish_asset\` instead; keep the same colours and thin-line rules. Use SVG for normal interactive, small to medium data.

\`\`\`js
const rows = [{ label: 'v1', value: 24 }, { label: 'v2', value: 31 }];
const max = Math.max(0, ...rows.map(r => r.value));
const y = v => 170 - 130 * v / (max || 1);
const bars = rows.map((r, i) => \`<rect x="\${60 + i * 110}" y="\${y(r.value)}" width="54" height="\${170-y(r.value)}" fill="var(--chart-\${i+1})"/>\`).join('');
document.querySelector('svg').insertAdjacentHTML('beforeend', bars);
\`\`\`

For untrusted labels, build text nodes with DOM APIs or escape HTML before \`innerHTML\`.

## Mark recipes

After computing \`x(value)\` and \`y(value)\` from a shared plot box, use these compact SVG patterns. Keep marks in data order; create text through \`textContent\` if labels come from outside data. \`H\` is the zero baseline and \`W\` is a category band's width.

\`\`\`js
const bar = (x0, v, W, H, y) => \`<rect x="\${x0}" y="\${y(v)}" width="\${W}" height="\${H-y(v)}" fill="var(--chart-1)"/>\`;
const grouped = (x0, values, W, H, y) => values.map((v,i) =>
  \`<rect x="\${x0+i*W/values.length}" y="\${y(v)}" width="\${W/values.length-2}" height="\${H-y(v)}" fill="var(--chart-\${i+1})"/>\`).join('');
const line = (points, x, y) => \`<path d="\${points.map((p,i) => \`\${i?'L':'M'}\${x(p)} \${y(p)}\`).join(' ')}" fill="none" stroke="var(--chart-1)" stroke-width="var(--stroke-regular)"/>\`;
const area = (points, x, y, H) => \`<path d="\${linePath(points,x,y)} L\${x(points.at(-1))} \${H} L\${x(points[0])} \${H}Z" fill="var(--chart-1)" opacity=".16"/>\`;
const linePath = (points,x,y) => points.map((p,i) => \`\${i?'L':'M'}\${x(p)} \${y(p)}\`).join(' ');
\`\`\`

For scatter, draw one \`<circle>\` per valid \`(x,y)\` observation and use \`linearRegression(xs,ys)\` for an optional fit line from \`fit.intercept + fit.slope*x\`; show \`fit.r2\` and label the line “least squares fit.” For a histogram, use \`histogram(values,bins,min,max)\` from \`/kits/math.js\`, then draw \`counts[i]\` as touching bars between \`edges[i]\` and \`edges[i+1]\` (or divide by \`count * binWidth\` for density). For small multiples, call the same chart rendering function on each subgroup with one shared numeric domain and the same tick step; title each panel. These recipes use no data smoothing. A line chart with gaps should split into separate paths, not join across missing rows.
`,
  },
  "simulation": {
    id: "simulation",
    title: "Simulation",
    description: "Build small interactive models with the math kit, fixed timesteps, accessible controls, and a live readout.",
    section: "visual-guidelines",
    path: "sections/visual-guidelines/simulation.md",
    content: `---
name: simulation
description: Build small interactive models with the math kit, fixed timesteps, accessible controls, and a live readout.
---

# Simulation

Use a simple simulation when changing a parameter reveals the answer. A static chart is enough when only precomputed outcomes matter. Call \`get_page_context\`; load \`kit-api\` for exact signatures and \`style\` for visual rules. Preview both a start state and an interacted state before \`render_widget\`.

## Solver choice

| Model | Solver |
| --- | --- |
| Smooth nonconservative dynamics, short live integration, known small step | \`rk4Step(derivative,t,y,h, out?, workspace?)\` |
| Offline trajectory with sharp changes or unknown time scale | \`rk45(derivative,y0,t0,t1,{rtol,atol,sampleStep,maxSteps})\`, then animate samples |
| Conservative positions and velocities with position-dependent acceleration | \`velocityVerlet(acceleration,t,q,v,h,...)\`; monitor energy drift |
| Fit rather than dynamics | \`linearRegression\`, \`polynomialFit\`, or \`nonlinearLeastSquares\`; render residuals |

Use typed \`Float64Array\` state; derivative writes *every* output component. Keep the numerical model separate from drawing. For live motion, accumulate \`Math.min((now-last)/1000, 0.05)\`, integrate fixed \`h=1/120\` steps, cap at 6–8 steps per frame, and drop excessive backlog rather than spiralling. Reuse RK4 workspace and output arrays when possible. Render once per animation frame, at most ~60 fps; reduce DOM writes and Canvas device ratio. Pause on \`document.hidden\` and offscreen; reset \`last\` when resuming. Reduced motion shows a representative static state and allows button/slider stepping without autoplay. Never advance physical time by the number of frames.

Make range inputs and buttons native and labelled; keyboard arrows should work. Show current parameters, units, model assumptions, and one derived quantity such as energy, range, error, or fit \`r²\`. A slider change should reset the state if it changes initial conditions, or clearly continue with a changed parameter. Do not re-run Python on each input; precompute a small grid in the sandbox and interpolate locally if the model is expensive. Use the thin-line tokens on axes, trails and parts, and avoid screen-filling animation.

Minimal pendulum state and energy:

\`\`\`js
import { pendulum, rk4Step, createRk4Workspace } from '/kits/math.js';
const length = 1.4, gravity = 9.81;
const system = pendulum({ length, gravity, damping: 0.08, angle: 0.8 });
let state = system.initial, t = 0;
const work = createRk4Workspace(state.length);
function advance(h = 1/120) { state = rk4Step(system.derivative, t, state, h, undefined, work); t += h; }
function energy() { const [a,w] = state; return 0.5 * (length*w)**2 + gravity*length*(1-Math.cos(a)); }
\`\`\`

Projectile with quadratic drag uses \`projectileWithDrag({gravity:9.81,drag:0.02,vx:14,vy:12})\`; integrate its four-state \`[x,y,vx,vy]\` with \`rk4Step\`, stop at y=0 and report approximate range. For curve fit on observed data, call \`linearRegression(xs,ys)\`, draw points and \`fit.intercept + fit.slope*x\`, and show \`fit.r2\`; a fitted line is analysis, not an animation. See \`sim-double-pendulum\` for the complete loop. Use a short manimgx MP4 through \`sandbox\` when the sequence is timed, cinematic, or cannot benefit from input; publish it with \`publish_asset\`.

\`\`\`js
import { projectileWithDrag, rk4Step, linearRegression } from '/kits/math.js';
const shot = projectileWithDrag({ gravity:9.81, drag:0.02, vx:14, vy:12 });
let p = shot.initial, time = 0;
const trail = [[p[0],p[1]]];
while (p[1] >= 0 && time < 10) {
  p = rk4Step(shot.derivative,time,p,1/120);
  time += 1/120;
  trail.push([p[0],p[1]]);
}
const [x0,y0] = trail.at(-2), [x1,y1] = trail.at(-1);
const range = y1 < 0 ? x0 + (0-y0)*(x1-x0)/(y1-y0) : x1;
const xs = [0,1,2,3], ys = [1,2.1,2.9,4.2];
const fit = linearRegression(xs,ys);
const fittedAt = x => fit.intercept + fit.slope*x;
console.log({ range, r2:fit.r2, fittedAt2:fittedAt(2) });
\`\`\`
`,
  },
  "style": {
    id: "style",
    title: "Avenire visual style and token system",
    description: "Apply every Avenire theme token and the shared thin-line visual grammar to charts, simulations, and anatomy figures.",
    section: "visual-guidelines",
    path: "sections/visual-guidelines/style.md",
    content: `---
name: style
description: Apply every Avenire theme token and the shared thin-line visual grammar to charts, simulations, and anatomy figures.
---

# Avenire visual style and token system

Use \`var(--token)\` in HTML/SVG CSS. The host injects all \`:root\` values at first paint and sends updated values on \`avenire:themechange\`. Dark overrides colours; it inherits the same font, type, spacing, radius and stroke metrics. For Canvas, read \`getComputedStyle(document.documentElement).getPropertyValue('--token')\` on startup and each theme event. Avoid hardcoded colours or external fonts. The CSS \`@theme inline\` names are Tailwind aliases for app UI, not additional widget tokens.

| Token | Purpose and use | Light/dark |
| --- | --- | --- |
| \`--background\` | Page ground outside a card | Warm paper / deep ink |
| \`--foreground\` | Main explanatory text | Dark / light ink |
| \`--card\` | Figure/chart card surface | Near-white / dark panel |
| \`--card-foreground\` | Text on the card | Dark / light ink |
| \`--popover\` | Floating tip surface, when needed | Near-white / dark panel |
| \`--popover-foreground\` | Floating tip text | Dark / light ink |
| \`--primary\` | Primary action or a single semantic emphasis | Indigo shifts lighter in dark |
| \`--primary-foreground\` | Text on primary fill | Light / dark contrast |
| \`--secondary\` | Secondary control surface | Pale / dark surface |
| \`--secondary-foreground\` | Text on secondary fill | Dark / light contrast |
| \`--muted\` | Quiet control or key background | Pale / dark surface |
| \`--muted-foreground\` | Supporting prose, never tiny critical data alone | Medium / lighter ink |
| \`--accent\` | Selected or hovered surface, sparingly | Pale violet / deep violet |
| \`--accent-foreground\` | Text on accent surface | Dark / light violet contrast |
| \`--destructive\` | Error, invalid state or destructive control only | Red tuned per theme |
| \`--border\` | General UI outlines and dividers | Soft warm / translucent light |
| \`--input\` | Input outline | Soft warm / translucent light |
| \`--ring\` | Visible keyboard focus indicator | Indigo in both themes |
| \`--canvas\` | Drawing ground inside a figure | Paper tint / dark drawing plane |
| \`--canvas-grid\` | Subtle graph or construction grid | Translucent in both themes |
| \`--chart-1\` | First data series; preferred focused curve | Indigo, lighter in dark |
| \`--chart-2\` | Second series | Teal, lighter in dark |
| \`--chart-3\` | Third series | Warm orange, lighter in dark |
| \`--chart-4\` | Fourth series | Green, lighter in dark |
| \`--chart-5\` | Fifth series | Pink, lighter in dark |
| \`--chart-6\` | Sixth series | Olive, lighter in dark |
| \`--font-sans\` | UI, labels, captions, axes | System stack; inherited |
| \`--font-serif\` | Long-form prose or editorial quote only | System serif; inherited |
| \`--font-mono\` | Numeric readouts, code, technical scales | System mono; inherited |
| \`--text-xs\` | Tick/quiet label, if still readable at phone width | 0.75rem; inherited |
| \`--text-sm\` | Secondary label, control and figure caption | 0.875rem; inherited |
| \`--text-base\` | Body explanation and normal control | 1rem; inherited |
| \`--text-lg\` | Figure title or key readout | 1.125rem; inherited |
| \`--text-xl\` | Larger card heading only | 1.25rem; inherited |
| \`--text-2xl\` | Section heading outside compact widgets | 1.5rem; inherited |
| \`--leading-tight\` | Titles and compact numbers | 1.25; inherited |
| \`--leading-normal\` | Prose, controls and captions | 1.5; inherited |
| \`--space-1\` | Tiny gap between glyph and value | 0.25rem; inherited |
| \`--space-2\` | Tick/key/internal control gap | 0.5rem; inherited |
| \`--space-3\` | Closely related control/label pair | 0.75rem; inherited |
| \`--space-4\` | Default card inset or section gap | 1rem; inherited |
| \`--space-5\` | Spacious figure inset | 1.25rem; inherited |
| \`--space-6\` | Figure/title separation | 1.5rem; inherited |
| \`--space-8\` | Between separate panels | 2rem; inherited |
| \`--radius\` | Base card/input rounding; reduce for tiny mechanical plates | 0.625rem; inherited |
| \`--stroke-hairline\` | Construction lines, fine seams, ticks and leaders | 0.6px; inherited |
| \`--stroke-thin\` | Part edges, axes and small outlines | 1px; inherited |
| \`--stroke-regular\` | Data paths, main mechanics and measured trajectory | 1.5px; inherited |
| \`--stroke-emphasis\` | Single focal edge or selected trace; use sparingly | 2px; inherited |
| \`--stroke-dash\` | Hidden/secondary edges or comparison line; SVG \`stroke-dasharray\` | \`3 3\`; inherited |
| \`--stroke-dash-open\` | Long projection/motion guide; SVG \`stroke-dasharray\` | \`6 4\`; inherited |
| \`--figure-label\` | Quiet labels, ticks and small part names | Tracks muted ink per theme |
| \`--figure-leader\` | Leader lines and measured guides | Tracks border per theme |
| \`--figure-frame\` | Outer visual card frame | Tracks border per theme |
| \`--figure-label-size\` | Small labels in CSS/HTML; increase if cramped | Tracks \`--text-xs\`; inherited |

## Shared thin-line grammar

All charts, simulations, and anatomy figures use one deliberate finish: hairline construction marks, restrained fills, exact small parts, quiet labels with short leader lines where useful, and a framed \`--card\` on \`--background\`. Put title, concise hint and live readout in the card when they clarify interaction. In charts, make axes and grid hairline while data stay regular. In simulations, show the mechanism and one measured quantity with a labelled control. Anatomy figures add a recognisable instrument with a base, support, moving subject, scale and fasteners; every part has a physical job. Use \`--chart-1\` for the focal mechanism and \`--chart-2\` onward only for distinct variables. Keep solids mostly neutral; use four value levels through opacity and \`--canvas\`, \`--card\`, \`--muted\`, and \`--foreground\`, not anatomy's original palette.

Use a fixed \`viewBox\`, \`width:100%\`, and \`vector-effect:non-scaling-stroke\` where scaled SVG strokes would become too heavy. Check labels at 390 px. A subtle grid can orient a plot but should not compete with data. Lines should meet another part, an axis, or the frame; deliberate callouts may end in dots. Depth order matters for isometric parts. Reduce or remove decorative detail when it obscures the relationship.

Do: label units, direct-label a series when space permits, show visible focus, test both themes, keep primary action high contrast, and update Canvas on theme changes. Don't: encode meaning by colour alone, use raw hex values in widgets, use multiple glowing accents, fake 3D for simple stats, use tiny pale text for key numbers, draw arbitrary hatching, or let motion change a displayed value independently of its model.

This grammar is adapted from Anatomy (MIT, wheresryan22); the palette and semantic tokens are Avenire's.
`,
  },
  "visuals": {
    id: "visuals",
    title: "Visuals",
    description: "Route a Ruth visual to a plain chart, simple simulation, optional anatomy figure, or published sandbox media.",
    section: "visual-guidelines",
    path: "sections/visual-guidelines/visuals.md",
    content: `---
name: visuals
description: Route a Ruth visual to a plain chart, simple simulation, optional anatomy figure, or published sandbox media.
---

# Visuals

Prefer the smallest truthful visual that answers the student's question. A normal request for a comparison, trend, spreadsheet plot, or parameter sweep usually needs a plain chart or simple simulation. The fine thin-line finish in \`style\` applies to *every* visual; it does not require an elaborate isometric machine.

| Request or purpose | Make | Load |
| --- | --- | --- |
| “Compare v1 and v2 stats”; “plot this SEBI spreadsheet”; “show the trend” | Plain SVG grouped bars, line, area, scatter or histogram | \`chart\`, \`style\` |
| “What happens if drag changes?”; “move the initial angle” | Small interactive SVG/Canvas model with labelled controls and readout | \`simulation\`, \`style\`, \`kit-api\` |
| “Explain how gradient descent works as a mechanism”; “show the lock's pins” | Optional working physical analogy with real parts and one model | \`anatomy\`, \`anatomy-craft\`, \`style\`, \`kit-api\` |
| Huge static data, print/export, or a frame GIF | Python/pandas and matplotlib PNG/SVG/GIF | \`sandbox\`, \`style\` |
| A short narrated or timed math sequence that need not respond to input | manimgx MP4 | \`sandbox\` |
| PCB, schematic, or enclosure drawing from actual design files | \`kicad-cli\` export | \`sandbox\` |

Use prose or a small table if a visual adds no explanatory value. Never invent data, numeric results, or citations. An analogy must preserve the important causal relationships; if it would distort the concept, choose a chart or simulation.

## Widget workflow

1. Call \`get_page_context\` for width, platform, appearance, and theme tokens. Load the relevant skills and, for kit calls, \`kit-api\`.
2. Write one self-contained HTML document with inline \`<style>\` and \`<script type="module">\`. Embed computed data as JSON. Reserve the stage height (\`aspect-ratio\` or \`min-height\`) before module loading, set \`width:100%\`, use a fixed SVG \`viewBox\`, and keep text legible near 390 px.
3. Call \`preview_widget({ html, width?, appearance? })\`. Inspect screenshot, content height, and console. Check clipping, small labels, contrast, axis units, wrapping, zero or empty states, keyboard focus, theme, and whether the drawn state agrees with the readout. Revise and preview again, including dark and light and a narrow width when possible.
4. Call \`render_widget({ title, html })\` only after the preview is sound. Explain in chat prose what the learner should notice; name data source, units, and uncertainty where relevant. A tool result by itself is not an explanation.

The widget runs in an opaque-origin sandbox. CSP allows inline scripts/styles and imports only from \`/kits/math.js\`, \`/kits/iso.js\`, \`/kits/iso-gl.js\`; use inline \`ISO_CSS\` from \`/kits/iso.js\` because external stylesheet loads are not guaranteed. Images/media are \`data:\` or \`blob:\` only. No network requests, external fonts, chart libraries, fetch, CDN imports, or links to sandbox files. \`connect-src 'none'\`. Assets published with \`publish_asset\` are chat links, not widget imports.

Use semantic headings and a concise figure description or data table. SVG needs an accessible name; decorative parts are \`aria-hidden\`. All controls need labels, visible focus, native keyboard input, and a textual readout (\`aria-live\` only for discrete changes). Provide a static meaningful state when \`prefers-reduced-motion: reduce\` is set. Pause animation when the document is hidden or the figure is offscreen; cap work per frame. For Canvas, re-read computed tokens on \`avenire:themechange\` and redraw. Use \`var(--…)\` for the palette and type system.
`,
  },
  "kit-api": {
    id: "kit-api",
    title: "Ruth widget kits",
    description: "Use the exact math, isometric SVG and WebGL kit exports in standalone widgets.",
    section: "tool-guidelines",
    path: "../../../widget-kit/API.md",
    content: `---
name: kit-api
description: Use the exact math, isometric SVG and WebGL kit exports in standalone widgets.
---

Use this source for API signatures. Its literal demo colours show kit mechanics; use Avenire tokens from \`style\` in Ruth widgets.

# Ruth widget kits

Use inside a sandboxed widget's inline \`<script type="module">\`. Import only absolute paths on the widget origin: \`/kits/math.js\`, \`/kits/iso.js\`, and optionally \`/kits/iso-gl.js\`. The scripts make no network requests. \`math.js\` includes the pmndrs/math source plus the numerics below. The isometric source is MIT licensed by Ryan; pmndrs/math is MIT licensed by Isaac Mason. See \`src/math/LICENSE\`, \`src/iso/LICENSE\` and the built \`LICENSES.txt\`.

State vectors use \`Float64Array\`. Derivatives have signature \`(t, y, dydt) => void\` and **write every output component**. The ODE functions leave their input state intact and return new states. \`matrix(rows, cols, data)\` uses row-major order. Errors in shape, bracket, or convergence throw \`RangeError\`.

## ODE and mechanics

| Export                                                                                     | Purpose                                                                                                                  |
| ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| \`eulerStep(f, t, y, h, out?, scratch?): Float64Array\`                                      | One first-order Euler step.                                                                                              |
| \`rk4Step(f, t, y, h, out?, workspace?): Float64Array\`                                      | One fourth-order Runge–Kutta step.                                                                                       |
| \`createRk4Workspace(n): Rk4Workspace\`                                                      | Reusable stage arrays for allocation-free RK4 steps.                                                                     |
| \`rk4(f, y0, t0, t1, h): {t,y}[]\`                                                           | Fixed-step series, including both endpoints.                                                                             |
| \`rk45(f, y0, t0, t1, {rtol?,atol?,h?,sampleStep?,maxSteps?}?): {t,y}[]\`                    | Adaptive Dormand–Prince 5(4); accepted-step output, or regularly sampled Hermite interpolation when \`sampleStep\` is set. |
| \`velocityVerlet(acceleration, t, q, v, h, outQ?, outV?, workspace?): {q,v}\`                | Symplectic kick-drift-kick step for position-dependent acceleration.                                                     |
| \`createVerletWorkspace(n): VerletWorkspace\`                                                | Reusable acceleration arrays for allocation-free Verlet steps.                                                           |
| \`leapfrog(acceleration, t, q, v, h, outQ?, outV?, workspace?): {q,v}\`                      | Alias for velocity Verlet.                                                                                               |
| \`pendulum({length?,gravity?,damping?,drive?,frequency?,angle?,angularVelocity?}?): System\` | Configurable single pendulum.                                                                                            |
| \`simplePendulum(options?): System\`                                                         | Undamped, undriven pendulum.                                                                                             |
| \`dampedPendulum(options?): System\`                                                         | Pendulum with default damping 0.2.                                                                                       |
| \`drivenPendulum(options?): System\`                                                         | Driven pendulum with damping 0.2 and drive 1.2.                                                                          |
| \`doublePendulum({m1?,m2?,l1?,l2?,gravity?,theta1?,theta2?,omega1?,omega2?}?): System\`      | Four-state double pendulum \`[θ1,θ2,ω1,ω2]\`.                                                                              |
| \`springMass({mass?,stiffness?,damping?,position?,velocity?}?): System\`                     | Damped Hooke oscillator.                                                                                                 |
| \`nBodyGravity(masses, {G?,softening?}?): {derivative,acceleration}\`                        | Pairwise Newtonian gravity in 2D. \`q\` and \`v\` each hold interleaved \`[x0,y0,x1,y1,…]\`.                                   |
| \`threeBodyFigureEight(): System & {masses,positions,velocities,acceleration}\`              | Equal-mass periodic three-body initial condition, \`G=1\`.                                                                 |
| \`lorenz({sigma?,rho?,beta?,initial?}?): System\`                                            | Lorenz attractor \`[x,y,z]\`.                                                                                              |
| \`sir({beta?,gamma?,initial?}?): System\`                                                    | SIR epidemic fractions \`[S,I,R]\`.                                                                                        |
| \`projectileWithDrag({gravity?,drag?,x?,y?,vx?,vy?}?): System\`                              | Quadratic-drag projectile \`[x,y,vx,vy]\`.                                                                                 |

\`\`\`js
import { rk4, lorenz } from "/kits/math.js";
const { derivative, initial } = lorenz();
const samples = rk4(derivative, initial, 0, 20, 0.01);
\`\`\`

\`System\` is \`{ derivative, initial }\`. For n-body systems, the full ODE state is \`[...q, ...v]\`; Verlet uses the separate \`positions\` and \`velocities\` arrays.

## Roots, linear algebra, fitting

| Export                                                         | Purpose                                                         |
| -------------------------------------------------------------- | --------------------------------------------------------------- |
| \`bisection(f,a,b,{tolerance?,maxIterations?}?): number\`        | Guaranteed bracketed root by interval halving.                  |
| \`newton(f,x,{derivative?,tolerance?,maxIterations?}?): number\` | Newton root; centered numeric derivative by default.            |
| \`brent(f,a,b,{tolerance?,maxIterations?}?): number\`            | Fast, bracketed Brent root.                                     |
| \`numericDerivative(f,x,h?): number\`                            | Centered finite difference.                                     |
| \`matrix(rows,cols,data): Matrix\`                               | Copy data into a row-major dense matrix.                        |
| \`solve(A,b): Float64Array\`                                     | LU solve with partial pivoting.                                 |
| \`leastSquares(A,b): Float64Array\`                              | Householder QR least squares, rows ≥ columns.                   |
| \`inverse(A): Matrix\`                                           | Dense square inverse.                                           |
| \`determinant(A): number\`                                       | Signed determinant; zero for singular matrices.                 |
| \`linearRegression(xs,ys): Fit & {slope,intercept}\`             | Straight-line fit.                                              |
| \`polynomialFit(xs,ys,degree): Fit\`                             | Polynomial QR fit; coefficients in ascending powers.            |
| \`nonlinearLeastSquares(xs,ys,model,initial,options?): Fit\`     | Numeric-Jacobian Levenberg–Marquardt fit.                       |
| \`fitExponential(xs,ys,initial?): Fit\`                          | \`a*exp(rate*x)+offset\`, params \`[a,rate,offset]\`.               |
| \`fitSinusoid(xs,ys,initial?): Fit\`                             | \`a*sin(omega*x+phase)+offset\`, params \`[a,omega,phase,offset]\`. |
| \`fitGaussian(xs,ys,initial?): Fit\`                             | Gaussian plus offset, params \`[a,center,sigma,offset]\`.         |

\`Fit\` is \`{params: Float64Array, residuals: Float64Array, r2: number}\`. The residual is observed minus predicted. Supply an initial guess for nonlinear fitting when you know the parameter scale; the convenience functions provide guesses otherwise.

\`\`\`js
import { fitExponential, brent } from "/kits/math.js";
const fit = fitExponential([0, 1, 2, 3], [3.1, 1.8, 1.2, 0.8]);
const crossing = brent((x) => x * x - 2, 1, 2);
\`\`\`

## Calculus, interpolation, signals, statistics

| Export                                                      | Purpose                                                  |
| ----------------------------------------------------------- | -------------------------------------------------------- |
| \`simpson(f,a,b,intervals=100): number\`                      | Composite Simpson integral; even interval count.         |
| \`adaptiveSimpson(f,a,b,tolerance=1e-9,maxDepth=20): number\` | Recursive error-controlled integral.                     |
| \`trapezoid(xs,ys): number\`                                  | Trapezoid integral of unevenly spaced samples.           |
| \`linearInterpolate(x0,y0,x1,y1,x): number\`                  | Value on a line through two points.                      |
| \`naturalCubicSpline(xs,ys): (x)=>number\`                    | Natural cubic interpolant; knots must strictly increase. |
| \`catmullRom(p0,p1,p2,p3,t): number\`                         | Scalar Catmull–Rom segment, \`t\` from 0 to 1.             |
| \`fft(real,imag?): {real,imag}\`                              | Radix-2 complex FFT; length must be a power of two.      |
| \`fftReal(samples): {real,imag}\`                             | Real-input FFT helper.                                   |
| \`magnitudeSpectrum(samples): Float64Array\`                  | One-sided amplitudes, including DC and Nyquist.          |
| \`mean(data): number\`                                        | Arithmetic mean.                                         |
| \`variance(data,sample=false): number\`                       | Population or sample variance.                           |
| \`std(data,sample=false): number\`                            | Standard deviation.                                      |
| \`histogram(data,bins=10,min?,max?): {edges,counts}\`         | Counts in half-open bins; last bin includes max.         |
| \`linspace(start,end,count): Float64Array\`                   | Even samples, inclusive endpoints.                       |
| \`arange(start,end,step=1): Float64Array\`                    | Stepped samples, exclusive endpoint.                     |
| \`mapRange(value,inMin,inMax,outMin,outMax): number\`         | Affine mapping of ranges.                                |
| \`clamp(value,min,max): number\`                              | Clamp scalar (pmndrs core).                              |
| \`lerp(a,b,t): number\`                                       | Linear mix (pmndrs core).                                |

\`\`\`js
import { magnitudeSpectrum, linspace, naturalCubicSpline } from "/kits/math.js";
const x = linspace(0, 1, 5);
const curve = naturalCubicSpline(x, [0, 1, 0, -1, 0]);
const spectrum = magnitudeSpectrum(
  Float64Array.from({ length: 64 }, (_, i) => Math.sin((2 * Math.PI * 4 * i) / 64)),
);
\`\`\`

## Vendored pmndrs/math

Named namespace exports keep the large upstream API discoverable without colliding with numerics. All vector and matrix operations use the upstream **out-first** convention: pass a mutable output array first, then inputs. Reuse the output array in animation loops.

| Import                          | API family and typical call                                                                                                               |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| \`vec2\`, \`vec3\`, \`vec4\`          | Tuple vectors; \`vec3.add(out, a, b)\`, \`vec3.normalize(out, a)\`, \`vec3.dot(a,b)\`.                                                          |
| \`mat2\`, \`mat2d\`, \`mat3\`, \`mat4\` | Column-major transforms; \`mat4.identity(out)\`, \`mat4.multiply(out,a,b)\`.                                                                  |
| \`quat\`, \`quat2\`, \`euler\`        | Rotations and dual quaternions; \`quat.slerp(out,a,b,t)\`.                                                                                  |
| \`spherical\`, \`polar\`            | Coordinate conversions.                                                                                                                   |
| \`shapes\`                        | Namespaces \`box2\`, \`box3\`, \`obb3\`, \`plane3\`, \`sphere\`, \`circle\`, \`segment2\`, \`polygon2\`, \`triangle2\`, \`triangle3\`, \`raycast3\`, \`frustum\`. |
| \`geometry\`                      | \`circumcircle\`, polygon decomposition/triangulation, 2D and 3D quickhulls.                                                                |
| \`time\`                          | \`easing\`, \`spring\`, \`spring2\`, \`spring3\`, \`spring4\` namespaces.                                                                           |
| \`random\`                        | \`mulberry32\`, \`isaac32\`, \`isaac64\`, \`random\` generators.                                                                                  |
| \`noise\`                         | Fractal, Perlin, simplex, and Worley noise.                                                                                               |
| \`color\`                         | \`color\`, \`colorspace\`, \`hsl\` conversions and parsing.                                                                                     |
| \`ik\`                            | 2D and 3D FABRIK inverse kinematics.                                                                                                      |

Top-level scalar and angle signatures:

| Export                                                        | Purpose                                                     |
| ------------------------------------------------------------- | ----------------------------------------------------------- |
| \`round(a)\`, \`equals(a,b,epsilon?)\`                            | Rounded scalar and approximate equality.                    |
| \`fade(t)\`, \`lerp(a,b,t)\`, \`lagrange(a,b,c,t)\`                 | Smooth fade, linear mix, and three-point interpolation.     |
| \`binomial(n,k)\`                                               | Binomial coefficient.                                       |
| \`clamp(value,min,max)\`, \`repeat(t,length)\`                    | Bound a scalar or wrap it periodically.                     |
| \`remap(value,inLow,inHigh,outLow,outHigh)\`, \`remapClamp(...)\` | Rescale with optional clamping.                             |
| \`degreesToRadians(degrees)\`, \`radiansToDegrees(radians)\`      | Convert angle units.                                        |
| \`wrapAngle(a)\`, \`deltaAngle(current,target)\`                  | Normalize an angle and find shortest difference.            |
| \`EPSILON\`, \`DEGREES_TO_RADIANS\`, \`RADIANS_TO_DEGREES\`         | Scalar constants.                                           |
| \`euler\`                                                       | Euler angle operations; \`euler.fromQuat(out, quat, "xyz")\`. |

The core also exports \`vec*\`, \`mat*\`, \`quat*\`, \`euler\`, \`spherical\`, and \`polar\` at top level. The source under \`src/math/\` is the definitive signature reference for its 700+ individual operations.

## Isometric drawing

\`/kits/iso.js\` exports the anatomy SVG geometry functions and namespace helpers below. Inline \`ISO_CSS\` in a \`<style>\` element, since the widget CSP allows inline styles. \`iso.css\` is also emitted for hosts whose style policy permits a stylesheet.

| Export                                                                                   | Purpose                                       |
| ---------------------------------------------------------------------------------------- | --------------------------------------------- |
| \`fitProjection(points,width,height,{pad?,headroom?,azimuth?,elevation?}?): Projection\`   | Camera fitting all extreme points.            |
| \`iso(point,P): [sx,sy]\`, \`depthOf(point,P): number\`, \`cameraOf(P)\`                       | Project and depth-sort 3D points.             |
| \`slabOf(plan,z,height,P,steps?,bevel?)\`, \`cylinder(cx,cy,r,z,height,P,steps?,bevel?)\`    | Box or round solid paths.                     |
| \`extrude(ring,z,height,P,options?)\`, \`ringOf(plan,steps?)\`, \`circleRing(cx,cy,r,steps?)\` | Prism and floor outlines.                     |
| \`solidSvg(paths,style?)\`, \`lineSvg(d,style?)\`, \`dotsSvg(points,style?)\`                  | SVG markup for solids, paths, and points.     |
| \`figureSvg({width,height,label,body,standalone?,className?})\`, \`plateHtml(options)\`      | Accessible SVG or complete card markup.       |
| \`axisVector(P,vector)\`, \`translateAlong(P,vector)\`, \`holdStill(element,vector)\`          | Motion helpers.                               |
| \`lathe.*\`, \`tube.*\`                                                                      | Round solids and pipes/cables as SVG paths.   |
| \`canvasPainter.CANVAS2D.mount(...)\`                                                      | Optional 2D painter layer.                    |
| \`gl.*\` and top-level WebGL helpers from \`/kits/iso-gl.js\`                                | Optional WebGL layer and camera/GLSL helpers. |

Other SVG runtime exports, grouped by use:

| Export                                                                                      | Purpose                                           |
| ------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| \`AZIMUTH\`, \`ELEVATION\`, \`SHADES\`, \`ISO_CSS\`                                                 | Camera defaults, tone count, and stylesheet text. |
| \`pathOf(points,closed?)\`, \`joinPaths(paths)\`                                                | Build or join SVG path strings.                   |
| \`roundedPlan(plan,steps?)\`, \`insetPlan(plan,by)\`                                            | Rounded floor polygon and its inset.              |
| \`onTop(points,z,P,closed?)\`, \`lineOnTop(a,b,z,P)\`, \`planOutline(plan,z,P,steps?)\`           | Lines on horizontal faces.                        |
| \`ring(cx,cy,r,z,P,steps?)\`, \`segment(a,b,P)\`, \`rise(at,z0,z1,P)\`                            | Round, spatial, and vertical lines.               |
| \`pointsAt(points,P)\`, \`dotGrid(x,y,cols,rows,gap,z,P)\`                                      | Project points and perforation grids.             |
| \`corners(plan,inset?)\`, \`boxCorners(plan,z0,z1)\`                                            | Floor or volume corners for composition.          |
| \`knurl(cx,cy,r,z0,z1,count,P,inset?)\`, \`sideArc(cx,cy,r,z,P,steps?)\`                        | Cylinder details.                                 |
| \`sideSeam(plan,z,P,steps?)\`, \`ringSeam(ring,z,P)\`, \`sideRing(center,r,axis,P,steps?)\`       | Seams and vertical-face rings.                    |
| \`coil(from,to,center,r,turns,axis,P,perTurn?)\`                                              | Spring linework in back/front halves.             |
| \`topTicks(from,to,step,every,edge,z,lengths,P,axis?)\`, \`sideTicks(...)\`, \`radialTicks(...)\` | Ruler and dial ticks.                             |
| \`haloOf(plan,z,height,P)\`, \`screenRise(height,P)\`, \`towardViewer(P)\`                        | Shadow path and camera measurements.              |
| \`topMatrix(at,z,P,along?)\`, \`sideMatrix(at,z,P,face)\`                                       | SVG text transforms on faces.                     |
| \`fadedSvg(list,style?)\`, \`fadeLineSvg(points,options?)\`                                     | Fading surface detail.                            |
| \`wireSvg(from,to,options?)\`, \`faceTextSvg(transform,text,options?)\`                         | Connectors and labels.                            |
| \`groupSvg(children,attrs?)\`, \`pageHtml(options)\`                                            | Markup wrappers.                                  |

The detailed option types are in \`src/iso/iso-kit.ts\`.

### Round parts and tubes

The \`lathe\` namespace is for axis-based solids. \`F\` is a frame from \`frameAlong(origin,axis)\`; \`P\` is the projection. A meridian/profile is a list of \`[axialPosition,radius]\` knots.

| Export                                                                                                                             | Purpose                                        |
| ---------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| \`lathe.dot3(a,b)\`, \`lathe.add3(a,b)\`, \`lathe.sub3(a,b)\`, \`lathe.mul3(a,k)\`                                                         | Small 3D vector operations.                    |
| \`lathe.len3(a)\`, \`lathe.unit3(a)\`, \`lathe.cross3(a,b)\`, \`lathe.lerp3(a,b,t)\`                                                       | Length, normalization, cross product, and mix. |
| \`lathe.viewOf(P)\`, \`lathe.lightOf(P)\`, \`lathe.scaleOf(P)\`                                                                          | View, light, and camera scale.                 |
| \`lathe.bandOf(score)\`, \`lathe.toneOf(normal,P)\`                                                                                    | Surface tone from orientation.                 |
| \`lathe.frameAlong(origin,axis)\`, \`lathe.frameOf(origin,axis,u,v)\`                                                                  | Build axial coordinate frames.                 |
| \`lathe.pointOf(F,s,r,angle)\`, \`lathe.radialOf(F,angle)\`, \`lathe.tangentOf(F,angle)\`, \`lathe.angleToward(F,direction)\`              | Map axial polar points and directions.         |
| \`lathe.hullOf(points)\`, \`lathe.runsOf(flags)\`, \`lathe.stepsFor(radius,least?,most?,scale?)\`                                        | Hull, visible runs, and adaptive tessellation. |
| \`lathe.curveRuns(meridian)\`, \`lathe.softOf(meridian)\`                                                                              | Smooth meridian sections.                      |
| \`lathe.lathe(meridian,F,P,options?)\`, \`lathe.outlineOf(meridian,F,P,options?)\`                                                     | Shaded spun solid and its silhouette.          |
| \`lathe.saddleStart(R,a,angle)\`, \`lathe.saddleOf(F,a,start,end,P,options?)\`                                                         | Saddle joints on curved ports.                 |
| \`lathe.prismOf(F,polygon,s0,s1,P)\`, \`lathe.stadium(r0,r1,offset,steps?)\`                                                           | Axial prism and stadium outline.               |
| \`lathe.sphereOf(center,r,P,options?)\`, \`lathe.disc(s0,s1,r,F,P,options?)\`, \`lathe.ringBand(s0,s1,rIn,rOut,F,P,options?)\`           | Ball, disc, and annular band.                  |
| \`lathe.solidOf(profile,F,P,options?)\`, \`lathe.bandOfProfile(profile,F,P,options?)\`                                                 | Solids from radius profiles.                   |
| \`lathe.silhouettePoints(profile,F,P,options?)\`, \`lathe.silhouetteOf(profile,F,P,options?)\`, \`lathe.profileCurve(profile,options?)\` | Analytic profile outline.                      |
| \`lathe.bandsOf(profile,cuts,F,P,options?)\`                                                                                         | Tone bands along a curved body.                |
| \`lathe.arcOf(F,s,r,P,options?)\`, \`lathe.circleOf(F,s,r,P,steps?)\`, \`lathe.spokesOf(F,s,r0,r1,count,P,options?)\`                    | Ring arcs, circles, and spokes.                |
| \`lathe.fadeOf(value,[lo,hi])\`, \`lathe.ribsOf(F,s0,s1,r,count,P,options?)\`, \`lathe.dotsOf(F,s,r,count,P,options?)\`                  | Faded surface texture.                         |
| \`lathe.rodOut(F,from,to,r,P,options?)\`, \`lathe.facingOf(F,angle,P,slope?)\`                                                         | Rod and facing geometry.                       |
| \`lathe.fillet(points,r,perArc?,options?)\`, \`lathe.resample(points,spacing)\`, \`lathe.pathLength(points)\`                            | Smooth and measure routes.                     |
| \`lathe.cut(points,from,to)\`, \`lathe.pointAlong(points,at)\`, \`lathe.tangentAlong(points,at)\`                                        | Subroute and arclength queries.                |
| \`lathe.spiral(F,s,r0,r1,a0,a1,steps?)\`, \`lathe.arcPoints(F,s,r,a0,a1,steps?)\`                                                      | 3D coil and arc point sets.                    |
| \`tube.runsOf(total,gaps?)\`, \`tube.crossingsOf(points,center,axis,radius)\`                                                          | Split routes at gaps and fittings.             |
| \`tube.tubePieces(points3,radius,P,options?)\`, \`tube.ringsSvg(rings,tone?)\`, \`tube.tubeSvg(piece,style?)\`                           | Shade, section, and paint pipes/cables.        |
| \`canvasPainter.CANVAS2D.mount(stage,controller,options?)\`                                                                          | Mount optional 2D canvas painter.              |

For advanced material options, use \`src/iso/lathe.mjs\`, \`tube.mjs\`, and \`canvas-painter.mjs\` as the signature source.

\`/kits/iso-gl.js\` exports \`GLSL_ISO\`, \`GLSL_TURN\`, \`glslPose(name,prefix?)\`, \`glCamera(P)\`, \`glLayer({canvas,fragment,view,camera,uniforms?,fixed?,extensions?,maxRatio?,untransformed?,onError?})\`, \`smooth(a,b,x)\`, \`burst(age,rise,fall)\`, and \`settle(state,target,dt,seconds,calm?)\`. The \`gl\` namespace includes the legacy WebGL variant. These helpers position and animate fragment shaders in the same isometric camera as SVG.

\`\`\`js
import { fitProjection, boxCorners, slabOf, solidSvg, figureSvg, ISO_CSS } from "/kits/iso.js";
const style = document.createElement("style");
style.textContent = ISO_CSS;
document.head.append(style);
const plan = { x: 0, y: 0, w: 80, d: 50, r: 5 };
const P = fitProjection(boxCorners(plan, 0, 12), 400, 250);
document.body.innerHTML = figureSvg({
  width: 400,
  height: 250,
  label: "Isometric block",
  body: solidSvg(slabOf(plan, 0, 12, P)),
});
\`\`\`

## Complete widget: double pendulum on canvas

\`\`\`html
<!doctype html><meta charset="utf-8" /><canvas
  id="view"
  width="520"
  height="360"
  aria-label="Double pendulum"
></canvas>
<script type="module">
  import { doublePendulum, rk4Step, createRk4Workspace } from "/kits/math.js";
  const canvas = document.querySelector("#view"),
    ctx = canvas.getContext("2d");
  const { derivative, initial } = doublePendulum({ gravity: 4, theta1: 1.8, theta2: 2.4 });
  let state = initial,
    t = 0,
    workspace = createRk4Workspace(initial.length);
  function frame() {
    for (let i = 0; i < 4; i++) {
      rk4Step(derivative, t, state, 1 / 240, state, workspace);
      t += 1 / 240;
    }
    const [a, b] = state,
      cx = 260,
      cy = 85,
      scale = 105;
    const x1 = cx + scale * Math.sin(a),
      y1 = cy + scale * Math.cos(a);
    const x2 = x1 + scale * Math.sin(b),
      y2 = y1 + scale * Math.cos(b);
    ctx.clearRect(0, 0, 520, 360);
    ctx.strokeStyle = "#d7e3ed";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
    ctx.fillStyle = "#4ab9de";
    for (const [x, y] of [
      [x1, y1],
      [x2, y2],
    ]) {
      ctx.beginPath();
      ctx.arc(x, y, 8, 0, Math.PI * 2);
      ctx.fill();
    }
    requestAnimationFrame(frame);
  }
  frame();
</script>
\`\`\`

## Complete widget: three-body figure-eight on canvas

\`\`\`html
<!doctype html><meta charset="utf-8" /><canvas
  id="view"
  width="520"
  height="360"
  aria-label="Three-body orbit"
></canvas>
<script type="module">
  import { threeBodyFigureEight, velocityVerlet, createVerletWorkspace } from "/kits/math.js";
  const canvas = document.querySelector("#view"),
    ctx = canvas.getContext("2d");
  const system = threeBodyFigureEight();
  let q = system.positions,
    v = system.velocities,
    t = 0,
    workspace = createVerletWorkspace(q.length);
  const colors = ["#54c6e7", "#e9a45a", "#d983be"];
  function frame() {
    ctx.fillStyle = "rgba(8,18,28,0.12)";
    ctx.fillRect(0, 0, 520, 360);
    for (let step = 0; step < 8; step++) {
      velocityVerlet(system.acceleration, t, q, v, 0.004, q, v, workspace);
      t += 0.004;
      for (let body = 0; body < 3; body++) {
        ctx.fillStyle = colors[body];
        ctx.beginPath();
        ctx.arc(260 + q[body * 2] * 115, 180 - q[body * 2 + 1] * 115, 2.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    requestAnimationFrame(frame);
  }
  frame();
</script>
\`\`\`

## Complete widget: noisy curve fit plotted in SVG

\`\`\`html
<!doctype html><meta charset="utf-8" /><svg
  id="plot"
  viewBox="0 0 520 300"
  role="img"
  aria-label="Noisy exponential data and fitted curve"
></svg>
<script type="module">
  import { fitExponential, linspace } from "/kits/math.js";
  let seed = 19;
  const random = () => (seed = (1664525 * seed + 1013904223) >>> 0) / 2 ** 32 - 0.5;
  const xs = linspace(0, 4, 25),
    ys = xs.map((x) => 2.2 * Math.exp(-0.7 * x) + 0.3 + random() * 0.18);
  const { params } = fitExponential(xs, ys, [2, -0.5, 0.2]);
  const X = (x) => 36 + x * 112,
    Y = (y) => 270 - y * 85;
  const svg = document.querySelector("#plot"),
    ns = "http://www.w3.org/2000/svg";
  const path = document.createElementNS(ns, "path"),
    points = linspace(0, 4, 160);
  path.setAttribute(
    "d",
    Array.from(
      points,
      (x, i) =>
        \`\${i ? "L" : "M"}\${X(x).toFixed(1)} \${Y(params[0] * Math.exp(params[1] * x) + params[2]).toFixed(1)}\`,
    ).join(" "),
  );
  path.setAttribute("fill", "none");
  path.setAttribute("stroke", "#3bc4dd");
  path.setAttribute("stroke-width", "2");
  svg.append(path);
  xs.forEach((x, i) => {
    const dot = document.createElementNS(ns, "circle");
    dot.setAttribute("cx", String(X(x)));
    dot.setAttribute("cy", String(Y(ys[i])));
    dot.setAttribute("r", "3");
    dot.setAttribute("fill", "#f1b970");
    svg.append(dot);
  });
</script>
\`\`\`
`,
  },
} as const satisfies Record<string, SkillDefinition>;

export type SkillId = keyof typeof SKILL_MAP;

export const AVAILABLE_SKILLS = ["concept-explainer","flashcard-generator","quiz-creator","study-notes-creator","summary-generator","sandbox","anatomy-arcade-cabinet","anatomy-desk-computer","anatomy-dial-indicator","anatomy-raptor-engine","anatomy-ripple-tank","anatomy-spot-plate","anatomy-test-rig","anatomy-turning-dial","chart-comparison","chart-from-spreadsheet","sim-double-pendulum","anatomy-3d","anatomy-craft","anatomy-motion","anatomy","chart","simulation","style","visuals","kit-api"] as const;
export const STUDY_SKILLS = ["concept-explainer","flashcard-generator","quiz-creator","study-notes-creator","summary-generator"] as const;
export const VISUAL_SKILLS = ["anatomy-3d","anatomy-craft","anatomy-motion","anatomy","chart","simulation","style","visuals"] as const;
export const VISUAL_EXAMPLE_SKILLS = ["anatomy-arcade-cabinet","anatomy-desk-computer","anatomy-dial-indicator","anatomy-raptor-engine","anatomy-ripple-tank","anatomy-spot-plate","anatomy-test-rig","anatomy-turning-dial","chart-comparison","chart-from-spreadsheet","sim-double-pendulum"] as const;
export const TOOL_SKILLS = ["sandbox","kit-api"] as const;
