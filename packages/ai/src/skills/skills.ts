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

Clear explanations at the appropriate difficulty level. Choose a direct physical model, a real mechanism, or an analogy according to what makes the causal relationship clearest. Do not force an analogy onto a pendulum or other self-explanatory physical system. For interactive figures load \`explainer\`; keep this verbal explanation in chat, not inside the widget.

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
- [ ] Uses a relatable analogy when it is clearer than the direct explanation
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
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <style>
      body {
        margin: 0;
        font: var(--text-base)/var(--leading-normal) var(--font-sans);
        color: var(--foreground);
      }
      figure {
        margin: auto;
        max-width: 700px;
        padding: var(--space-4);
        background: var(--card);
        border: var(--stroke-hairline) solid var(--figure-frame);
        border-radius: var(--radius);
      }
      h2 {
        margin: 0;
        font-size: var(--text-lg);
      }
      p {
        margin: var(--space-2) 0 0;
        color: var(--muted-foreground);
        font-size: var(--text-sm);
      }
      figcaption {
        font-size: var(--text-sm);
        color: var(--muted-foreground);
      }
      svg {
        display: block;
        width: 100%;
        height: auto;
        margin-top: var(--space-3);
      }
      .axis {
        stroke: var(--figure-leader);
        stroke-width: var(--stroke-hairline);
      }
      .tick {
        fill: var(--figure-label);
        font-size: calc(var(--figure-label-size) * 1.3);
        font-family: var(--font-sans);
      }
      .value {
        fill: var(--foreground);
        font-size: calc(var(--figure-label-size) * 1.3);
        font-family: var(--font-mono);
      }
    </style>
  </head>
  <body>
    <figure>
      <h2>v1 and v2 · example metrics</h2>
      <p>Demonstration values, units in percent. Replace with measured data.</p>
      <svg
        id="plot"
        viewBox="0 0 480 285"
        role="img"
        aria-label="Grouped bars comparing v1 and v2 on recall and accuracy"
      ></svg>
      <figcaption id="caption"></figcaption>
    </figure>
    <script type="module">
      const data = [
        { label: "Recall", unit: "%", v1: 64, v2: 76 },
        { label: "Accuracy", unit: "%", v1: 71, v2: 74 },
      ];
      const svg = document.getElementById("plot"),
        ns = "http://www.w3.org/2000/svg";
      function add(tag, attrs, text) {
        const el = document.createElementNS(ns, tag);
        for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
        if (text !== undefined) el.textContent = text;
        svg.append(el);
        return el;
      }
      const top = 28,
        bottom = 225,
        left = 54,
        right = 448,
        y = (v) => bottom - (v / 100) * (bottom - top);
      for (let t = 0; t <= 100; t += 25) {
        add("line", { x1: left, x2: right, y1: y(t), y2: y(t), class: "axis" });
        add("text", { x: left - 10, y: y(t) + 4, "text-anchor": "end", class: "tick" }, \`\${t}%\`);
      }
      data.forEach((d, i) => {
        const cx = 158 + i * 184;
        for (const [j, key] of ["v1", "v2"].entries()) {
          const x = cx - 42 + j * 43,
            v = d[key];
          add("rect", {
            x,
            y: y(v),
            width: 34,
            height: bottom - y(v),
            fill: \`var(--chart-\${j + 1})\`,
          });
          add("text", { x: x + 17, y: y(v) - 6, "text-anchor": "middle", class: "value" }, \`\${v}%\`);
        }
        add("text", { x: cx - 4, y: bottom + 22, "text-anchor": "middle", class: "tick" }, d.label);
        add(
          "text",
          { x: cx - 4, y: bottom + 41, "text-anchor": "middle", class: "value" },
          \`+\${d.v2 - d.v1} pp\`,
        );
      });
      add("text", { x: 175, y: 18, class: "tick" }, "v1");
      add("rect", { x: 157, y: 8, width: 11, height: 11, fill: "var(--chart-1)" });
      add("text", { x: 236, y: 18, class: "tick" }, "v2");
      add("rect", { x: 218, y: 8, width: 11, height: 11, fill: "var(--chart-2)" });
      document.getElementById("caption").textContent =
        "Recall improves by 12 percentage points; accuracy by 3 percentage points.";
    </script>
  </body>
</html>
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
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <style>
      body {
        margin: 0;
        font: var(--text-base)/var(--leading-normal) var(--font-sans);
        color: var(--foreground);
      }
      figure {
        margin: auto;
        max-width: 700px;
        padding: var(--space-4);
        border: var(--stroke-hairline) solid var(--figure-frame);
        border-radius: var(--radius);
        background: var(--card);
      }
      h2 {
        margin: 0;
        font-size: var(--text-lg);
      }
      p,
      figcaption {
        font-size: var(--text-sm);
        color: var(--muted-foreground);
      }
      svg {
        width: 100%;
        height: auto;
        display: block;
      }
      .rule {
        stroke: var(--figure-leader);
        stroke-width: var(--stroke-hairline);
      }
      .label {
        fill: var(--figure-label);
        font: calc(var(--figure-label-size) * 1.3) var(--font-sans);
      }
    </style>
  </head>
  <body>
    <figure>
      <h2>Monthly average · example index</h2>
      <p>Index units. Replace the embedded values and unit with the spreadsheet aggregate.</p>
      <svg
        id="plot"
        viewBox="0 0 480 260"
        role="img"
        aria-label="Monthly trend in index units"
      ></svg>
      <figcaption id="caption"></figcaption>
    </figure>
    <script type="module">
      const rows = [
        { date: "2026-01", value: 21 },
        { date: "2026-02", value: 24 },
        { date: "2026-03", value: 22 },
        { date: "2026-04", value: 29 },
      ];
      const svg = document.getElementById("plot"),
        ns = "http://www.w3.org/2000/svg";
      function add(tag, attrs, text) {
        const e = document.createElementNS(ns, tag);
        for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
        if (text !== undefined) e.textContent = text;
        svg.append(e);
      }
      const values = rows.map((r) => r.value),
        min = Math.floor(Math.min(0, ...values) / 10) * 10,
        max = Math.ceil(Math.max(...values) / 10) * 10 || 10;
      const X = (i) => 50 + (i * 390) / Math.max(1, rows.length - 1),
        Y = (v) => 210 - ((v - min) / (max - min)) * 160;
      for (let v = min; v <= max; v += 10) {
        add("line", { x1: 50, x2: 440, y1: Y(v), y2: Y(v), class: "rule" });
        add("text", { x: 42, y: Y(v) + 4, "text-anchor": "end", class: "label" }, String(v));
      }
      const line = rows.map((r, i) => \`\${i ? "L" : "M"}\${X(i)} \${Y(r.value)}\`).join(" ");
      add("path", {
        d: line,
        fill: "none",
        stroke: "var(--chart-1)",
        "stroke-width": "var(--stroke-regular)",
        "stroke-linejoin": "round",
      });
      rows.forEach((r, i) => {
        add("circle", { cx: X(i), cy: Y(r.value), r: 3, fill: "var(--chart-1)" });
        add("text", { x: X(i), y: 234, "text-anchor": "middle", class: "label" }, r.date.slice(5));
      });
      document.getElementById("caption").textContent =
        \`From \${rows[0].value} to \${rows.at(-1).value} over \${rows.length} months (demonstration values).\`;
    </script>
  </body>
</html>
\`\`\`
`,
  },
  "explainer-double-pendulum": {
    id: "explainer-double-pendulum",
    title: "Double pendulum example",
    description: "A concise direct physical figure: two linked pendulum rods, native Step/Run/Reset controls, a start-angle slider and an energy readout, using fixed-step RK4.",
    section: "visual-examples",
    path: "sections/visual-examples/explainer-double-pendulum.md",
    content: `---
name: explainer-double-pendulum
description: A concise direct physical figure: two linked pendulum rods, native Step/Run/Reset controls, a start-angle slider and an energy readout, using fixed-step RK4.
---

# Double pendulum example

Use \`explainer\` and \`style\`. This system explains itself through two rods and bobs; it does not need an unrelated machine or a text panel. The four-state solver and energy use equal 1kg masses and 1m rods. Explanation belongs in chat. The page contains only a short caption and compact controls/readout.

\`\`\`html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <style>
      body {
        margin: 0;
        color: var(--figure-text);
        background: var(--figure-page);
        font: 14px/1.5 var(--font-sans);
      }
      figure {
        max-width: 680px;
        margin: auto;
        padding: 12px;
      }
      .plate {
        background: var(--figure-card);
        border: var(--figure-weight) solid var(--figure-mid);
        padding: 16px;
      }
      .corners {
        display: flex;
        justify-content: space-between;
        gap: 12px;
        font: 11px/1.4 var(--figure-mono);
        color: var(--figure-muted);
      }
      .title {
        text-align: right;
        color: var(--figure-strong);
      }
      svg {
        display: block;
        width: 100%;
        height: auto;
      }
      .rod {
        stroke: var(--figure-hi);
        stroke-width: var(--figure-weight);
        vector-effect: non-scaling-stroke;
      }
      .controls {
        display: flex;
        align-items: center;
        gap: 10px;
        flex-wrap: wrap;
        margin: 8px 0 12px;
        font: 12px var(--figure-mono);
      }
      button {
        font: inherit;
        color: var(--figure-strong);
        background: transparent;
        border: var(--figure-weight) solid var(--figure-mid);
        padding: 6px 10px;
      }
      label {
        display: flex;
        align-items: center;
        gap: 8px;
      }
      input {
        accent-color: var(--figure-lit);
        max-width: 125px;
      }
      :focus-visible {
        outline: 2px solid var(--figure-hi);
        outline-offset: 3px;
      }
      output {
        font: 11px/1.4 var(--figure-mono);
        color: var(--figure-strong);
        font-variant-numeric: tabular-nums;
      }
      figcaption {
        margin-top: 10px;
        font-size: 12px;
        color: var(--figure-text);
      }
      @media (max-width: 440px) {
        .footer {
          flex-direction: column;
        }
        .title {
          max-width: 75%;
        }
        .plate {
          padding: 12px;
        }
      }
    </style>
  </head>
  <body>
    <figure>
      <div class="plate">
        <div class="corners"><span>Fig 1</span><span class="title">DOUBLE PENDULUM</span></div>
        <svg
          viewBox="0 0 440 400"
          role="img"
          aria-label="Two linked rods with bobs swinging about a fixed pivot"
        >
          <line x1="200" y1="195" x2="240" y2="195" class="rod" />
          <line id="a" class="rod" />
          <line id="b" class="rod" />
          <circle cx="220" cy="200" r="4" fill="var(--figure-dot)" />
          <circle id="bob1" r="7" fill="var(--figure-face)" class="rod" />
          <circle id="bob2" r="9" fill="var(--figure-lit)" class="rod" />
        </svg>
        <div class="controls">
          <button id="step" type="button">Step</button><button id="toggle" type="button">Run</button
          ><button id="reset" type="button">Reset</button
          ><label
            >Start angle
            <input
              id="angle"
              aria-label="First rod starting angle in degrees"
              type="range"
              min="20"
              max="150"
              value="90"
            /><span id="degrees">90°</span></label
          >
        </div>
        <div class="corners footer">
          <span>Change angle · step or run</span><output id="energy" aria-live="off"></output>
        </div>
      </div>
      <figcaption>
        Two equal 1kg masses on 1m rods, without damping. Small changes to the starting angle can
        lead to very different paths.
      </figcaption>
    </figure>
    <script type="module">
      import { doublePendulum, rk4Step, createRk4Workspace } from "/kits/math.js";
      const angle = document.getElementById("angle"),
        toggle = document.getElementById("toggle"),
        out = document.getElementById("energy");
      let system,
        state,
        work,
        t = 0,
        last = 0,
        acc = 0,
        visible = true,
        playing = false;
      new IntersectionObserver(([entry]) => {
        visible = entry.isIntersecting;
        last = 0;
      }).observe(document.querySelector("figure"));
      function reset() {
        system = doublePendulum({
          m1: 1,
          m2: 1,
          l1: 1,
          l2: 1,
          gravity: 9.81,
          theta1: (Number(angle.value) * Math.PI) / 180,
          theta2: 0.35,
        });
        state = system.initial;
        work = createRk4Workspace(state.length);
        t = 0;
        acc = 0;
        last = 0;
        document.getElementById("degrees").textContent = angle.value + "°";
        draw();
      }
      function advance() {
        state = rk4Step(system.derivative, t, state, 1 / 120, undefined, work);
        t += 1 / 120;
        if (!state.every(Number.isFinite)) {
          playing = false;
          reset();
        }
      }
      function draw() {
        const [a, b, w1, w2] = state,
          x1 = 220 + 90 * Math.sin(a),
          y1 = 200 + 90 * Math.cos(a),
          x2 = x1 + 90 * Math.sin(b),
          y2 = y1 + 90 * Math.cos(b);
        const set = (id, attrs) => {
          const e = document.getElementById(id);
          for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
        };
        set("a", { x1: 220, y1: 200, x2: x1, y2: y1 });
        set("b", { x1, y1, x2, y2 });
        set("bob1", { cx: x1, cy: y1 });
        set("bob2", { cx: x2, cy: y2 });
        const kinetic = 0.5 * (2 * w1 * w1 + w2 * w2 + 2 * w1 * w2 * Math.cos(a - b));
        const potential = 9.81 * (3 - 2 * Math.cos(a) - Math.cos(b));
        out.textContent = \`t \${t.toFixed(1)} s · E \${(kinetic + potential).toFixed(2)} J\`;
        toggle.textContent = playing ? "Pause" : "Run";
      }
      angle.addEventListener("input", reset);
      document.getElementById("reset").addEventListener("click", reset);
      document.getElementById("step").addEventListener("click", () => {
        playing = false;
        for (let i = 0; i < 4; i++) advance();
        acc = 0;
        last = 0;
        draw();
      });
      toggle.addEventListener("click", () => {
        playing = !playing;
        last = 0;
        draw();
      });
      document.addEventListener("visibilitychange", () => {
        last = 0;
        acc = 0;
      });
      function frame(now) {
        if (playing && !document.hidden && visible) {
          acc += last ? Math.min((now - last) / 1000, 0.05) : 0;
          let steps = 0;
          while (acc >= 1 / 120 && steps < 6) {
            advance();
            acc -= 1 / 120;
            steps++;
          }
          if (acc >= 1 / 120) acc = 0;
          draw();
        }
        last = now;
        requestAnimationFrame(frame);
      }
      reset();
      requestAnimationFrame(frame);
    </script>
  </body>
</html>
\`\`\`

The model starts still in both motion modes, so the learner chooses Step or Run. Its screen coordinates allow every angle without clipping; lengths used for drawing have the same ratio as the solver. Energy includes a constant offset so zero is the lowest hanging state; that does not change the dynamics. Keep these numerical/representation notes in chat, not as extra widget paragraphs.
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

Use a plain chart for data questions, comparisons, and trends. For how/why concept explanations, use \`explainer\` to choose a direct model, mechanism or analogy. Use hand-written SVG and embedded computed JSON, with no chart library. Call \`get_page_context\`, load \`style\`, preview with \`preview_widget\`, then \`render_widget\`. Start from a question, identify the relevant fields and units, and do not invent observations.

| Question | Marks and scale |
| --- | --- |
| One value per category | Bar from zero; sort only if order is not meaningful |
| v1 versus v2 or several cohorts | Grouped bars with shared zero baseline; annotate delta in units and percent (if baseline nonzero) |
| Values over time | Line with true ordered dates and gaps for missing values; use area only when zero baseline and magnitude matter |
| Relation between two measures | Scatter; optional fit line using \`linearRegression\` from \`kit-api\`; say what was fitted, never imply causation |
| Frequency distribution | Histogram of equal-width bins; show count or density and bin width |
| Several comparable subgroups | Small multiples with the **same scale** and axes, unless clearly labelled otherwise |

For a numeric axis, compute a “nice” step from \`10^floor(log10(range/targetTicks)) × {1,2,5,10}\`. Round domain outward; include zero for bars and area. Map y with \`bottom - (value - min)/(max - min) * plotHeight\`; guard equal min/max. Render 3–6 ticks with units and localized formatting (\`Intl.NumberFormat\`). Keep date spacing proportional to time unless the data are categories. Never silently connect across nulls or truncate an axis to dramatize a change. Use sufficient margins for tick labels, then measure the narrow preview.

Use neutral ink \`--figure-hi\`, \`--figure-mid\`, \`--figure-lo\` for ordinary series; reserve \`--figure-red/green/blue\` for real signals. Widget aliases \`--chart-1..6\` follow those tones. Use \`--stroke-regular\` for data lines, \`--stroke-hairline\` and \`--figure-leader\` for axes and rules, \`--figure-label\` and \`--figure-label-size\` for ticks, and \`--figure-frame\` for the card. No gradient is needed for ordinary charts. Label each line directly at its end when possible; use a legend for crowded lines or grouped bars. Pair colour with text, point shape, or dash. Annotate the one comparison or inflection that answers the question; keep annotation lines thin. Include a short caption or accessible table with precise values. Explain the takeaway in chat prose, with denominator and uncertainty if relevant.

## Data workflow

Use the user's supplied numbers, search/read tools for cited sources, or the sandbox for CSV/XLSX. In the sandbox, inspect columns and missing values with pandas, parse dates and numeric fields explicitly, compute aggregates there, and print compact JSON. Embed that JSON literal in the HTML; never use \`fetch\` in the widget. See \`chart-from-spreadsheet\` for a complete example. If there are many thousands of marks, if the user needs a static export, or if frame-by-frame animation is the point, draw with matplotlib and \`publish_asset\` instead; keep the same colours and thin-line rules. Use SVG for normal interactive, small to medium data.

\`\`\`js
const rows = [
  { label: "v1", value: 24 },
  { label: "v2", value: 31 },
];
const max = Math.max(0, ...rows.map((r) => r.value));
const y = (v) => 170 - (130 * v) / (max || 1);
const bars = rows
  .map(
    (r, i) =>
      \`<rect x="\${60 + i * 110}" y="\${y(r.value)}" width="54" height="\${170 - y(r.value)}" fill="var(--chart-\${i + 1})"/>\`,
  )
  .join("");
document.querySelector("svg").insertAdjacentHTML("beforeend", bars);
\`\`\`

For untrusted labels, build text nodes with DOM APIs or escape HTML before \`innerHTML\`.

## Mark recipes

After computing \`x(value)\` and \`y(value)\` from a shared plot box, use these compact SVG patterns. Keep marks in data order; create text through \`textContent\` if labels come from outside data. \`H\` is the zero baseline and \`W\` is a category band's width.

\`\`\`js
const bar = (x0, v, W, H, y) =>
  \`<rect x="\${x0}" y="\${y(v)}" width="\${W}" height="\${H - y(v)}" fill="var(--chart-1)"/>\`;
const grouped = (x0, values, W, H, y) =>
  values
    .map(
      (v, i) =>
        \`<rect x="\${x0 + (i * W) / values.length}" y="\${y(v)}" width="\${W / values.length - 2}" height="\${H - y(v)}" fill="var(--chart-\${i + 1})"/>\`,
    )
    .join("");
const line = (points, x, y) =>
  \`<path d="\${points.map((p, i) => \`\${i ? "L" : "M"}\${x(p)} \${y(p)}\`).join(" ")}" fill="none" stroke="var(--chart-1)" stroke-width="var(--stroke-regular)"/>\`;
const area = (points, x, y, H) =>
  \`<path d="\${linePath(points, x, y)} L\${x(points.at(-1))} \${H} L\${x(points[0])} \${H}Z" fill="var(--chart-1)" opacity=".16"/>\`;
const linePath = (points, x, y) =>
  points.map((p, i) => \`\${i ? "L" : "M"}\${x(p)} \${y(p)}\`).join(" ");
\`\`\`

For scatter, draw one \`<circle>\` per valid \`(x,y)\` observation and use \`linearRegression(xs,ys)\` for an optional fit line from \`fit.intercept + fit.slope*x\`; show \`fit.r2\` and label the line “least squares fit.” For a histogram, use \`histogram(values,bins,min,max)\` from \`/kits/math.js\`, then draw \`counts[i]\` as touching bars between \`edges[i]\` and \`edges[i+1]\` (or divide by \`count * binWidth\` for density). For small multiples, call the same chart rendering function on each subgroup with one shared numeric domain and the same tick step; title each panel. These recipes use no data smoothing. A line chart with gaps should split into separate paths, not join across missing rows.

## Figure frame

Frame every page with Fig n at top left and a short mono uppercase title at top right; hint bottom left and mono tabular live readout bottom right. Put the legend and a true caption under the card, not inside the drawing. Use square corners, --figure-card on --figure-page, a hairline --figure-mid frame, 0.6px construction strokes, and calm --figure-ease motion. Charts keep units/tick labels in their plot; simulations use one model for readout and motion. Use kit plateHtml if working in Node. Keep it responsive at 390px, fix preview errors before delivery, and deliver built files by path.
`,
  },
  "explainer": {
    id: "explainer",
    title: "Interactive explainer",
    description: "Explain concepts with crafted interactive figures: direct physical models for simple systems, real mechanisms for machines, and faithful analogies for abstract ideas. Combine precise numerical models with restrained isometric craft and concise controls/readouts.",
    section: "visual-guidelines",
    path: "sections/visual-guidelines/explainer.md",
    content: `---
name: explainer
description: Explain concepts with crafted interactive figures: direct physical models for simple systems, real mechanisms for machines, and faithful analogies for abstract ideas. Combine precise numerical models with restrained isometric craft and concise controls/readouts.
---

# Interactive explainer

Choose the representation that makes the causal relationship easiest to understand. Visual style guides the finish and behaviour, not a required code structure, part count, or long build process. Load \`style\` for tokens and \`kit-api\` only for signatures you need. Keep the explanation in chat and let the widget demonstrate it.

## Choose the explanation before drawing

Ask: what should the learner be able to predict after moving one control?

| Concept | Best starting view | What changes and what it teaches |
| --- | --- | --- |
| Simple pendulum | Direct side view of a pivot, rod, bob and a faint trail | Change length/damping; angle, speed and period follow the same physical model |
| Double pendulum | Two linked rods and two bobs; a short trail, optional nearby initial state | Change starting angle; distinguish sensitive dependence from random motion |
| Projectile or spring | Direct trajectory or mass/spring | Change drag/stiffness; show the resulting path or oscillation with real units |
| How an engine works | Cutaway of the actual piston, crank, cylinder and valves | Step through intake, compression, power and exhaust; show which motion causes the next |
| Gradient descent | A follower on a machined loss profile with a feed linked to learning rate, or a direct curve if the mathematical geometry is clearer | The slope determines direction; learning rate determines distance; all positions/readouts use the same update |
| Cache or another abstract system | A familiar mechanism with a one-to-one mapping, such as matching pins releasing a lock | Matching state avoids repeated work; label the meaningful correspondences |
| Compare measurements or show a trend | \`chart\` | Preserve the actual data, scales and units |

A real physical system often explains itself: do not turn a pendulum into an elaborate unrelated machine. For an existing machine, reveal its actual mechanism before inventing an analogy. Use an analogy for a complex/abstract idea only when it reduces mental work and preserves the important causal relationships. Briefly state its limit in the caption or chat. Complexity is a reason to choose the view carefully, not to add parts or prose indiscriminately.

## A quiet widget

One dominant figure. A small \`Fig n\` at top left and a short mono uppercase title at top right. Put a short interaction hint bottom left and 2–4 relevant tabular values bottom right. Native labelled sliders and Step/Run/Reset controls where useful. Below the card: an optional legend with 2–4 short labels and one caption, at most two short sentences. Keep legend plus caption under about 50 words.

Do not place a lesson, derivation, assumptions panel, instructions list, repeated explanation, equation wall or multiple text cards inside the widget. Put those explanations in chat. A symbol/unit beside a control or readout is enough. Accessible descriptions may be fuller without being visibly repeated. Choose the minimum controls that expose the concept; changing an initial condition resets the state, while a live parameter change clearly continues or resets it.

## Physical craft

Use \`--figure-*\` tokens, opaque faces, four facing shades, 0.6px non-scaling hairlines and calm motion. Ground the object on a base or pivot with a subtle contact shadow. Base/detail use lo/faint, structure mid, the explanatory subject hi, and one lit accent. Red/green/blue are meaningful signals, never a decorative rainbow.

For mechanisms and analogies, borrow the finish of a small real instrument: feet, rails, carriage bushings, end stops, groove/ruler, screw heads, a knurled control, a dial and a probe. Each detail has a purpose and sits on another part. Keep simple physical models simple; a pivot, two rods and bobs can be the whole double pendulum.

- Solid parts have filled top and side faces, convincing volume and consistent lighting. Do not approximate a solid by translucent wireframes or a pile of disconnected polygons.
- Paint back to front and bottom to top; split a part that wraps a moving component into back/front pieces. Moving pieces stay in their physical depth slot.
- A seam, tick, rod or needle ends on a real edge, stroke, dot or mount. Avoid floating line ends, unsupported parts and visibly interpenetrating solids.
- Round parts are actually round: circles/ellipses or kit cylinders, lathes, rings and spheres, with only the visible rim outlined. The bob/probe must remain visible where it contacts its track.
- Reuse component functions and procedural detail; never author thousands of raw paths. Precompute static geometry, move rigid pieces by transforms, and rebuild only a shape that changes.
- Isometric camera: roughly 45° azimuth and 30° elevation, adjusted to reveal the working surfaces. A pendulum's direct side view can be clearer. Do not force 3D onto every concept.
- Fit the camera/stage around the working object; avoid huge empty faces and corners. The focal part, controls and values must remain legible at 390px.
- Motion carries meaning: a feed advances because of the actual update, a crank drives a piston, a valve opens at the appropriate stroke. Decorative wiggle is not an explanation.

## The maths drives everything

Use one state and one model for the drawing, readout, controls and caption. Keep the numerical model in a small pure function/module. Never animate a plausible-looking path independently of the numbers. State units and material simplifications compactly; a mechanism analogy must not pretend to be an exact physical simulation.

| Model | Solver |
| --- | --- |
| Smooth short live dynamics with a known small step | \`rk4Step(derivative,t,state,h,out?,workspace?)\` |
| Offline trajectory with sharp changes or unknown time scale | \`rk45(derivative,y0,t0,t1,{rtol,atol,sampleStep,maxSteps})\`, then animate samples |
| Conservative positions/velocities with position-dependent acceleration | \`velocityVerlet(...)\`; monitor energy drift |
| Fit observed data | \`linearRegression\`, \`polynomialFit\`, \`nonlinearLeastSquares\`; chart residuals |
| Algorithm or engine cycle with discrete phases | Exact state update / phase transitions; no ODE solver unless the model requires one |

Use \`Float64Array\` state and write every derivative component. Reuse solver workspaces/output buffers. Integrate fixed physical steps (often \`h=1/120\`), not one step per animation frame. Accumulate elapsed time with a 0.05s clamp, perform at most 6 substeps/frame, drop an excessive backlog, and draw once. Check finite state, boundary conditions and a meaningful invariant such as energy; stop or reset when the model leaves its domain. Do not silently clamp a divergent optimizer and describe it as convergence.

\`\`\`js
import { pendulum, rk4Step, createRk4Workspace } from '/kits/math.js';
const length=1.4, gravity=9.81;
const system=pendulum({length,gravity,damping:0.08,angle:0.8});
let state=system.initial,t=0;
const work=createRk4Workspace(state.length);
function advance(h=1/120){state=rk4Step(system.derivative,t,state,h,undefined,work);t+=h;}
function energyPerMass(){const [a,w]=state;return .5*(length*w)**2+gravity*length*(1-Math.cos(a));}
\`\`\`

\`doublePendulum({m1,m2,l1,l2,gravity,theta1,theta2,omega1,omega2})\` returns \`[θ1,θ2,ω1,ω2]\` state with its derivative. Use the same lengths/masses in geometry and energy. See \`explainer-double-pendulum\` for a complete concise page. For \`projectileWithDrag\`, integrate \`[x,y,vx,vy]\` until ground contact and interpolate the last crossing. Expensive computation can be precomputed in the sandbox and interpolated locally; do not call Python/network on every slider input.

For gradient descent use \`next = x - learningRate * derivative(x)\`. The gauge reads that derivative and the feed applies that update. A ball on a loss profile is a controlled follower, not a claim that gravity implements gradient descent. Distinguish local from global minima and a zero gradient at a maximum from convergence; large learning rate can overshoot or diverge.

## Runtime and delivery

Use concise inline HTML/SVG/Canvas and optional bundled kit imports (\`/kits/math.js\`, \`/kits/iso.js\`, \`/kits/iso-gl.js\`). A Node example is an option, not the mandatory authoring pipeline. Aim for under 24 KiB of authored code. \`get_page_context\` provides the sandbox \`runtime.sourceRoot\`; when needed read a relevant source/reference there, in one batch rather than repeatedly browsing an entire example. Available source examples include dial-indicator, test-rig, arcade-cabinet, raptor-engine, ripple-tank, turning-dial, desk-computer and spot-plate. Craft, kit, motion and verify references are available under that root. Read only what improves this figure.

Use ES modules or a private IIFE for live code. An inlined kit already declares its helpers: do not redeclare names such as \`lineOnTop\` in the same global scope. Pin kit imports to the page's bundled runtime; no network, external scripts/fonts or CDN libraries. Inline \`ISO_CSS\` if using the isometric kit. For sandbox builds copy sources to a writable directory and preserve relative imports; reference sources are read only.

Batch skill/context lookups, then build, preview and deliver. Do not announce a 30–90 minute production workflow for normal chat. Run \`preview_widget({html})\` or \`{path}\` once to load and exercise the page in an isolated local browser on the chat server. Inspect its labeled screenshots, \`ok\`, summary, overflow, console, errors and per-action interaction report. The preview varies controls (min/mid/max, selects, toggles, buttons and detectable drags), checks labels/focus and watches for freezes within a 25-action/20-second exploration budget; coverage beyond that budget is unverified. \`path\` reads the built file from the thread sandbox, then renders locally. An \`error\`, \`uncaught\` exception, broken interaction or visible clipping is a failure: repair it, rebuild if needed, and preview again until it is clean. Use as many steps as necessary to fix the error, freshly preview and deliver. Avoid unnecessary reference browsing, decoration or unrelated audits. Never render a known-broken page or claim an unrun check passed.

After a clean preview call \`render_widget({title,html})\` or \`{title,path}\`, explain what to notice in chat, and close the sandbox when finished. A file in the sandbox is not delivery. Use \`path\` for large built pages; never read a multi-MB HTML file into model context. Full geometry audits and exhaustive theme/orbit checks are for explicitly requested deep verification.

Native keyboard controls, visible focus, an accessible SVG/Canvas description and a discrete live readout are required. Reduced motion starts in a meaningful still state with manual stepping; pause while hidden/offscreen, cap frame work and reset the clock on resume. Read theme variables again on \`avenire:themechange\`; redraw Canvas/WebGL without resetting model state. Hint/readout must wrap or stack on phones.
`,
  },
  "style": {
    id: "style",
    title: "Figure style",
    description: "Shared figure tokens and figure framing for all Ruth widgets, charts and simulations; app UI palette stays separate.",
    section: "visual-guidelines",
    path: "sections/visual-guidelines/style.md",
    content: `---
name: style
description: Shared figure tokens and figure framing for all Ruth widgets, charts and simulations; app UI palette stays separate.
---

# Figure style

Every widget uses the shared two-theme token layer. The host injects it before first paint and on \`avenire:themechange\`; it updates \`.iso\` wrappers’ data-theme and values. Standalone kit \`--light\` pages retain their own theme outside the host. Read Canvas/WebGL tokens on its nearest \`.iso\` wrapper (and redraw/reconfigure on themechange). Use CSS variables for every colour and preserve the kit’s four facing shades; do not replace them with opacity approximations.

| Token | Purpose | Light | Dark |
| --- | --- | --- | --- |
| \`--figure-page\` | Page ground | \`#f2f2ef\` | \`#0b0b0b\` |
| \`--figure-card\` | Framed card surface | \`#fbfbfa\` | \`#131313\` |
| \`--figure-text\` | Caption and live readout ink | \`#57575a\` | \`#a3a3a3\` |
| \`--figure-strong\` | Strong explanatory ink | \`#18181a\` | \`#e6e6e6\` |
| \`--figure-muted\` | Hints, quiet labels, legend | \`#8c8c90\` | \`#6e6e6e\` |
| \`--figure-paper\` | Opaque backing fill hiding parts behind | \`#fbfbfa\` | \`#131313\` |
| \`--figure-face\` | Lit subject backing | \`#ffffff\` | \`#1b1b1b\` |
| \`--figure-top\` | Normal upper faces | \`#ffffff\` | \`#1c1c1c\` |
| \`--figure-shade-0\` | Side facing away from light | \`#dcdcd9\` | \`#0f0f0f\` |
| \`--figure-shade-1\` | Second side tone | \`#e5e5e2\` | \`#121212\` |
| \`--figure-shade-2\` | Third side tone | \`#ededea\` | \`#151515\` |
| \`--figure-shade-3\` | Side facing toward light | \`#f4f4f1\` | \`#181818\` |
| \`--figure-lit-top\` | Selected upper face | \`#ffffff\` | \`#262626\` |
| \`--figure-lit-shade\` | Selected side faces | \`#eeeeeb\` | \`#1d1d1d\` |
| \`--figure-hi\` | Subject outlines | \`#26262a\` | \`#d4d4d4\` |
| \`--figure-mid\` | Structural outlines and card frame | \`#8a8a8f\` | \`#6a6a6a\` |
| \`--figure-lo\` | Base outlines and minor ticks | \`#b4b4b8\` | \`#3e3e3e\` |
| \`--figure-faint\` | Grooves, creases and quiet detail | \`#d4d4d6\` | \`#2a2a2a\` |
| \`--figure-lit\` | Exactly one active accent | \`#000000\` | \`#ffffff\` |
| \`--figure-halo\` | Contact shadow colour | \`#8a8a80\` | \`#050505\` |
| \`--figure-halo-opacity\` | Contact shadow alpha | \`.32\` | \`.9\` |
| \`--figure-dot\` | Screws and rivets | \`#3a3a3e\` | \`#e6e6e6\` |
| \`--figure-red\` | Red signal, when semantic | \`#e5484d\` | \`#ff6b6b\` |
| \`--figure-green\` | Green signal, when semantic | \`#30a46c\` | \`#6be0a0\` |
| \`--figure-blue\` | Blue signal, when semantic | \`#3e63dd\` | \`#6b9bff\` |
| \`--figure-weight\` | Non-scaling 0.6px hairlines | \`.6px\` | \`.6px\` |
| \`--figure-ease\` | Calm motion easing | \`cubic-bezier(.32,.72,0,1)\` | \`cubic-bezier(.32,.72,0,1)\` |
| \`--figure-mono\` | Technical labels and tabular readout font | \`ui-monospace,"SF Mono",Menlo,Consolas,monospace\` | \`ui-monospace,"SF Mono",Menlo,Consolas,monospace\` |
| \`--figure-lift\` | Subtle inset/drop shadow | \`inset 0 1px 0 0 #ffffff,0 0 0 1px #0000000f,0 1px 1px -.5px #0000000a,0 3px 3px -1.5px #0000000a,0 6px 6px -3px #0000000a,0 12px 12px -6px #0000000a\` | \`inset 0 1px 0 0 #ffffff0a,inset 0 0 0 1px #ffffff06,0 0 0 1px #00000026,0 1px 1px -.5px #00000014,0 3px 3px -1.5px #00000014,0 6px 6px -3px #00000014,0 12px 12px -6px #00000014\` |

The mono stack, weight and easing are identical in both themes. The lift shadow stays subtle; the card itself has a square hairline frame. Base/feet are lo, structure mid, subject hi, and exactly one lit accent (black in light, white in dark). True red/green/blue are for signals, never a rainbow series palette.

## Frame and controls

Use \`plateHtml\` from the sandbox kit, or reproduce its exact framing: Fig n top left; short mono uppercase title top right; interaction hint bottom left; mono tabular live readout bottom right. Legend keys and a concise true caption sit underneath the card. Keep legend plus caption under about 50 words; put the explanation/derivation in chat. At most one tiny engraved label is inside the machine. Native Step / Run / Reset buttons and parameter sliders have labels and visible focus. Use the same model for readout, part motion and caption. Ensure readout/hint wrap or stack at 390px without colliding. Reduced motion shows a meaningful still state with explicit stepping; stop loops while hidden/offscreen.

## Widget compatibility aliases

Widget semantic tokens map onto the figure layer: background→page; foreground→text; card/popover→card with strong ink; primary→lit on card ink; secondary→shade-2; muted→shade-3 with muted ink; accent→lit-shade with lit ink; destructive→red; border→mid; input→lo; ring→hi; canvas→paper; canvas-grid→faint; radius→0px. App shadcn tokens remain unchanged. \`--chart-1..6\` map to hi, mid, lo, red, green, blue respectively. Label or dash every series; use signals only when their meaning earns colour.

The shared typography/layout metrics remain: font-sans system UI, font-serif system serif, font-mono figure-mono; text-xs/sm/base/lg/xl/2xl = 0.75/0.875/1/1.125/1.25/1.5rem; leading-tight/normal = 1.25/1.5; space-1/2/3/4/5/6/8 = 0.25/0.5/0.75/1/1.25/1.5/2rem. Stroke-hairline = figure-weight, thin/regular/emphasis = 1/1.5/2px; dash = 3 3, dash-open = 6 4; figure-label = muted, figure-leader = lo, figure-frame = mid, figure-label-size = text-xs. These aliases exist for charts; interactive figures use the tokens directly.

Use fixed SVG viewBox, width:100%, vector-effect:non-scaling-stroke, opaque filled solids and correct painter order. Ground line ends on a stroke, dot or outline. Ordinary chat starts with one CSP-wrapped preview. Repair errors and preview again before delivery; continue as long as the task needs. Full capture/drive/lines/audit and repeated theme/phone checks are for explicitly requested deep verification. Reuse components and example patterns with any concise browser code; deliver large built pages with path.
`,
  },
  "visuals": {
    id: "visuals",
    title: "Visuals",
    description: "Choose a direct model, mechanism, analogy, data chart or published media for the clearest explanation.",
    section: "visual-guidelines",
    path: "sections/visual-guidelines/visuals.md",
    content: `---
name: visuals
description: Choose a direct model, mechanism, analogy, data chart or published media for the clearest explanation.
---

# Visuals

Start with the learning question and choose the simplest faithful representation. Load \`explainer\` for interactive concept figures and physical models, \`style\` for the common frame/tokens, and \`kit-api\` only when exact signatures are needed. The code can be concise SVG/Canvas, kit components or an optional Node build.

| Request | Representation |
| --- | --- |
| “Show a simple pendulum”; “play with a double pendulum” | Direct physical model: pivot, rods and bobs; real numerical state |
| “Explain how an engine works” | The actual mechanism/cutaway: piston, crank, valves and four strokes |
| “Explain how gradient descent finds a minimum, with the help of an interactive visualization” | A follower on a loss profile with slope-controlled feed, or direct mathematical geometry if clearer |
| “Why does a cache avoid repeated work?” | A faithful analogy/mechanism showing the matching state and avoided work |
| “Compare v1 and v2 numbers”; “plot this spreadsheet”; “show the trend” | \`chart\` with actual data, units and shared scales |
| Large static data or print/export | \`sandbox\` computation and published PNG/SVG/PDF |
| A timed sequence that does not benefit from input | \`sandbox\` video, published with \`publish_asset\` |

Do not invent an elaborate analogy for a physical system that already explains itself. Prefer a real mechanism for a real machine. Use analogy for abstract/complex concepts when its correspondences make the cause and effect easier to see. Never invent observations, numeric results or citations. Use prose or a small table if a visual adds no value.

Keep the widget quiet: one figure, a short title/hint, minimal labelled controls and 2–4 live values. A small legend and at most two short caption sentences can sit below the card. Explanations, derivations, examples and detailed assumptions belong in chat, not text panels inside the widget.

Batch skill/context lookup, build concisely, call \`preview_widget\` once, and repair actual errors with a fresh preview before \`render_widget\`. There is no step-count cap: continue until the error is fixed and the page is delivered, or explain an actual blocking failure. Avoid unnecessary redesign. Close the sandbox when finished.

Pass exactly one of \`html\` (512,000 bytes maximum) or \`path\` (8 MiB maximum). Built pages travel directly from the thread sandbox to preview/storage. Never read a multi-MB page into context. CSP permits inline scripts/styles and bundled \`/kits\` modules; images/media are \`data:\` or \`blob:\` only. No external libraries, fonts, network requests or sandbox file links. Use \`--figure-*\` tokens, accessible native controls, reduced-motion/manual stepping and a responsive stage.
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

\`/kits/iso.js\` exports the isometric SVG geometry functions and namespace helpers below. Inline \`ISO_CSS\` in a \`<style>\` element, since the widget CSP allows inline styles. \`iso.css\` is also emitted for hosts whose style policy permits a stylesheet.

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

The complete isometric example below installs \`ISO_CSS\`; geometry alone has no face or stroke styling.

## Complete widgets

These fragments run inside the widget bootstrap, which supplies the real light/dark \`--figure-*\` tokens. All four install \`ISO_CSS\` for geometry and \`plateHtml\` framing. Colours come only from figure tokens; lines and card frames are 0.6px. Keep the reference tables above when looking up signatures.

## Complete widget: double pendulum on canvas

\`\`\`html
<style>
.demo{max-width:650px;margin:auto;padding:1px 20px;font:14px/1.5 var(--font-sans);color:var(--figure-text)}
.demo .iso-plate{box-shadow:none;border:var(--figure-weight) solid var(--figure-mid)}
.demo .iso-plate-corner{font-size:11px;color:var(--figure-text)}.demo .iso-legend{color:var(--figure-text)}.demo .iso-swatch path{stroke-width:var(--figure-weight)}
canvas{display:block;width:100%;max-width:520px;height:auto;margin:auto}svg text{font:12px var(--figure-mono);fill:var(--figure-text)}
.controls{display:flex;align-items:center;flex-wrap:wrap;gap:8px;margin:12px 0}
button,input{accent-color:var(--figure-lit);font:12px var(--figure-mono)}
button{background:var(--figure-card);color:var(--figure-strong);border:var(--figure-weight) solid var(--figure-mid);padding:6px 12px}
button:focus-visible,input:focus-visible{outline:1px solid var(--figure-hi);outline-offset:3px}
.controls label{display:flex;align-items:center;gap:8px}
@media(max-width:560px){.demo .iso-plate-corner{white-space:normal;max-width:100%;line-height:1.4}.demo .iso-plate-corner[data-corner="hint"]{bottom:28px}.demo .iso-plate{padding-bottom:88px}}
</style>
<main class="iso demo" id="demo"></main>
<script type="module">
  import { doublePendulum, rk4Step, createRk4Workspace } from "/kits/math.js";
  import { ISO_CSS, plateHtml } from "/kits/iso.js";
  const host = document.querySelector("#demo");
  const style = document.createElement("style");
  style.textContent = ISO_CSS;
  document.head.append(style);
  host.innerHTML = plateHtml({fig:"Fig 1",title:"Double pendulum",hint:"Change the initial angle",readout:"",
    keys:[{mark:"edge",label:"Linked rods"},{mark:"lit",label:"Second bob"}],
    caption:"Two equal masses, 1 m rods. Energy is measured from the same state that moves the bobs.",
    body:'<canvas width="520" height="360" aria-label="Two linked pendulum rods and bobs"></canvas>'}) +
    '<div class="controls"><button data-step>Step</button><button data-run aria-pressed="false">Run</button><button data-reset>Reset</button><label>θ₁ <input data-angle type="range" min="30" max="140" value="103" aria-label="Initial first angle in degrees"></label></div>';
  const canvas = host.querySelector("canvas"), ctx = canvas.getContext("2d");
  const ratio=devicePixelRatio||1; canvas.width=520*ratio;canvas.height=360*ratio;ctx.scale(ratio,ratio);
  const h = 1/120, g = 9.81, work = createRk4Workspace(4);
  let system, state, t;
  function reset() { system = doublePendulum({gravity:g,theta1:Number(host.querySelector("[data-angle]").value)*Math.PI/180,theta2:2.4}); state = system.initial.slice(); t=0; }
  function advance() { rk4Step(system.derivative,t,state,h,state,work); t+=h; if (!state.every(Number.isFinite)) throw new RangeError("Non-finite pendulum state"); }
  function draw() {
    const css=getComputedStyle(host), ink=n=>css.getPropertyValue("--figure-"+n).trim();
    const [a,b,u,v]=state, x1=260+76*Math.sin(a), y1=168+76*Math.cos(a), x2=x1+76*Math.sin(b), y2=y1+76*Math.cos(b);
    ctx.clearRect(0,0,520,360); ctx.lineWidth=.6;
    ctx.strokeStyle=ink("lo"); ctx.beginPath(); ctx.moveTo(230,158);ctx.lineTo(290,158);ctx.stroke();
    ctx.strokeStyle=ink("hi");ctx.beginPath();ctx.moveTo(260,158);ctx.lineTo(260,168);ctx.lineTo(x1,y1);ctx.lineTo(x2,y2);ctx.stroke();
    for (const [x,y,fill] of [[260,168,"dot"],[x1,y1,"shade-2"],[x2,y2,"lit"]]) {
      ctx.fillStyle=ink(fill);ctx.beginPath();ctx.arc(x,y,x===260&&y===168?3:8,0,2*Math.PI);ctx.fill();ctx.stroke();
    }
    const energy=u*u+.5*v*v+u*v*Math.cos(a-b)-g*(2*Math.cos(a)+Math.cos(b));
    host.querySelector("[data-readout]").textContent=\`t \${t.toFixed(2)} s · E \${energy.toFixed(3)} J\`;
    canvas.dataset.time=String(t);
  }
  host.querySelector("[data-angle]").oninput=()=>{reset();draw();};
  reset();
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  let running = !reduced.matches, visible = true, last = 0, backlog = 0;
  const run = host.querySelector("[data-run]");
  const updateRun = () => { run.textContent = running ? "Pause" : "Run"; run.setAttribute("aria-pressed", String(running)); };
  run.onclick = () => { running = !running; last = 0; updateRun(); };
  host.querySelector("[data-step]").onclick = () => { running = false; updateRun(); for (let i=0;i<6;i++) advance(); draw(); };
  host.querySelector("[data-reset]").onclick = () => { reset(); last = backlog = 0; draw(); };
  document.addEventListener("visibilitychange", () => { last = backlog = 0; });
  new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; last = backlog = 0; }).observe(host);
  reduced.addEventListener("change", () => { if (reduced.matches) running = false; updateRun(); last = 0; });
  window.addEventListener("avenire:themechange", draw);
  function frame(now) {
    if (running && visible && !document.hidden) {
      backlog += last ? Math.min((now-last)/1000, .05) : 0;
      let steps=0;
      while (backlog >= h && steps++ < 6) { advance(); backlog -= h; }
      if (backlog >= h) backlog = 0;
      draw();
    }
    last = now;
    requestAnimationFrame(frame);
  }
  updateRun(); draw(); requestAnimationFrame(frame);
</script>
\`\`\`

## Complete widget: three-body figure-eight on canvas

\`\`\`html
<style>
.demo{max-width:650px;margin:auto;padding:1px 20px;font:14px/1.5 var(--font-sans);color:var(--figure-text)}
.demo .iso-plate{box-shadow:none;border:var(--figure-weight) solid var(--figure-mid)}
.demo .iso-plate-corner{font-size:11px;color:var(--figure-text)}.demo .iso-legend{color:var(--figure-text)}.demo .iso-swatch path{stroke-width:var(--figure-weight)}
canvas{display:block;width:100%;max-width:520px;height:auto;margin:auto}svg text{font:12px var(--figure-mono);fill:var(--figure-text)}
.controls{display:flex;align-items:center;flex-wrap:wrap;gap:8px;margin:12px 0}
button,input{accent-color:var(--figure-lit);font:12px var(--figure-mono)}
button{background:var(--figure-card);color:var(--figure-strong);border:var(--figure-weight) solid var(--figure-mid);padding:6px 12px}
button:focus-visible,input:focus-visible{outline:1px solid var(--figure-hi);outline-offset:3px}
.controls label{display:flex;align-items:center;gap:8px}
@media(max-width:560px){.demo .iso-plate-corner{white-space:normal;max-width:100%;line-height:1.4}.demo .iso-plate-corner[data-corner="hint"]{bottom:28px}.demo .iso-plate{padding-bottom:88px}}
</style>
<main class="iso demo" id="demo"></main>
<script type="module">
  import { threeBodyFigureEight, velocityVerlet, createVerletWorkspace } from "/kits/math.js";
  import { ISO_CSS, plateHtml } from "/kits/iso.js";
  const host = document.querySelector("#demo");
  const style = document.createElement("style");
  style.textContent = ISO_CSS;
  document.head.append(style);
  host.innerHTML=plateHtml({fig:"Fig 2",title:"Three-body orbit",hint:"Step through the orbit",readout:"",
    keys:[{mark:"lit",label:"Body 1"},{mark:"edge",label:"Body 2"},{mark:"dim",label:"Body 3"}],
    caption:"Equal masses in a figure-eight orbit, G = 1. The readout tracks relative energy drift.",
    body:'<canvas width="520" height="330" aria-label="Three equal masses following a figure-eight orbit"></canvas>'}) + '<div class="controls"><button data-step>Step</button><button data-run aria-pressed="false">Run</button><button data-reset>Reset</button></div>';
  const canvas=host.querySelector("canvas"),ctx=canvas.getContext("2d"),system=threeBodyFigureEight();
  const ratio=devicePixelRatio||1;canvas.width=520*ratio;canvas.height=330*ratio;ctx.scale(ratio,ratio);
  const h=1/240,work=createVerletWorkspace(6);
  let q,v,t,E0;
  const energy=()=>{let e=Array.from(v).reduce((s,x)=>s+.5*x*x,0);for(let i=0;i<3;i++)for(let j=i+1;j<3;j++)e-=1/Math.hypot(q[2*i]-q[2*j],q[2*i+1]-q[2*j+1]);return e;};
  function reset(){q=system.positions.slice();v=system.velocities.slice();t=0;E0=energy();}
  function advance(){velocityVerlet(system.acceleration,t,q,v,h,q,v,work);t+=h;if(!q.every(Number.isFinite))throw new RangeError("Non-finite orbit");}
  const guide=[],gq=system.positions.slice(),gv=system.velocities.slice(),gw=createVerletWorkspace(6);
  for(let i=0;i<1510;i++){velocityVerlet(system.acceleration,i*h,gq,gv,h,gq,gv,gw);guide.push([gq[0],gq[1]]);}
  function draw(){
    const css=getComputedStyle(host),ink=n=>css.getPropertyValue("--figure-"+n).trim();
    ctx.clearRect(0,0,520,330);ctx.lineWidth=.6;ctx.strokeStyle=ink("mid");
    ctx.beginPath();guide.forEach(([x,y],i)=>ctx[i?"lineTo":"moveTo"](260+135*x,165-135*y));ctx.stroke();
    ctx.strokeStyle=ink("lo");ctx.beginPath();ctx.moveTo(250,165);ctx.lineTo(270,165);ctx.moveTo(260,155);ctx.lineTo(260,175);ctx.stroke();
    ctx.font="12px "+css.getPropertyValue("--figure-mono");ctx.fillStyle=ink("text");ctx.fillText("x / a.u.",424,302);ctx.fillText("y / a.u.",25,28);
    for(let i=0;i<3;i++){
      const x=260+135*q[2*i],y=165-135*q[2*i+1];ctx.fillStyle=ink(["lit","shade-2","paper"][i]);ctx.strokeStyle=ink(["lit","hi","mid"][i]);
      ctx.beginPath();ctx.arc(x,y,6,0,2*Math.PI);ctx.fill();ctx.stroke();
      ctx.font="12px "+css.getPropertyValue("--figure-mono");ctx.fillStyle=ink("text");ctx.fillText(String(i+1),x+10,y-8);
    }
    host.querySelector("[data-readout]").textContent=\`t \${t.toFixed(2)} · ΔE \${((energy()-E0)/Math.abs(E0)).toExponential(1)}\`;
    canvas.dataset.time=String(t);
  }
  reset();
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  let running = !reduced.matches, visible = true, last = 0, backlog = 0;
  const run = host.querySelector("[data-run]");
  const updateRun = () => { run.textContent = running ? "Pause" : "Run"; run.setAttribute("aria-pressed", String(running)); };
  run.onclick = () => { running = !running; last = 0; updateRun(); };
  host.querySelector("[data-step]").onclick = () => { running = false; updateRun(); for (let i=0;i<6;i++) advance(); draw(); };
  host.querySelector("[data-reset]").onclick = () => { reset(); last = backlog = 0; draw(); };
  document.addEventListener("visibilitychange", () => { last = backlog = 0; });
  new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; last = backlog = 0; }).observe(host);
  reduced.addEventListener("change", () => { if (reduced.matches) running = false; updateRun(); last = 0; });
  window.addEventListener("avenire:themechange", draw);
  function frame(now) {
    if (running && visible && !document.hidden) {
      backlog += last ? Math.min((now-last)/1000, .05) : 0;
      let steps=0;
      while (backlog >= h && steps++ < 6) { advance(); backlog -= h; }
      if (backlog >= h) backlog = 0;
      draw();
    }
    last = now;
    requestAnimationFrame(frame);
  }
  updateRun(); draw(); requestAnimationFrame(frame);
</script>
\`\`\`

## Complete widget: noisy curve fit in SVG

\`\`\`html
<style>
.demo{max-width:650px;margin:auto;padding:1px 20px;font:14px/1.5 var(--font-sans);color:var(--figure-text)}
.demo .iso-plate{box-shadow:none;border:var(--figure-weight) solid var(--figure-mid)}
.demo .iso-plate-corner{font-size:11px;color:var(--figure-text)}.demo .iso-legend{color:var(--figure-text)}.demo .iso-swatch path{stroke-width:var(--figure-weight)}
canvas{display:block;width:100%;max-width:520px;height:auto;margin:auto}svg text{font:12px var(--figure-mono);fill:var(--figure-text)}
.controls{display:flex;align-items:center;flex-wrap:wrap;gap:8px;margin:12px 0}
button,input{accent-color:var(--figure-lit);font:12px var(--figure-mono)}
button{background:var(--figure-card);color:var(--figure-strong);border:var(--figure-weight) solid var(--figure-mid);padding:6px 12px}
button:focus-visible,input:focus-visible{outline:1px solid var(--figure-hi);outline-offset:3px}
.controls label{display:flex;align-items:center;gap:8px}
@media(max-width:560px){.demo .iso-plate-corner{white-space:normal;max-width:100%;line-height:1.4}.demo .iso-plate-corner[data-corner="hint"]{bottom:28px}.demo .iso-plate{padding-bottom:88px}}
</style>
<main class="iso demo" id="demo"></main>
<script type="module">
  import { fitExponential, linspace } from "/kits/math.js";
  import { ISO_CSS, plateHtml } from "/kits/iso.js";
  const host = document.querySelector("#demo");
  const style = document.createElement("style");
  style.textContent = ISO_CSS;
  document.head.append(style);
  let seed=19;
  const random=()=>(seed=(1664525*seed+1013904223)>>>0)/2**32-.5;
  const xs=linspace(0,4,25),ys=xs.map(x=>2.2*Math.exp(-.7*x)+.3+random()*.18);
  const {params,residuals,r2}=fitExponential(xs,ys,[2,-.5,.2]);
  const rmse=Math.sqrt(Array.from(residuals).reduce((s,r)=>s+r*r,0)/xs.length);
  host.innerHTML=plateHtml({fig:"Fig 3",title:"Exponential fit",hint:"Observed minus predicted",readout:\`RMSE \${rmse.toFixed(3)} · R² \${r2.toFixed(3)}\`,
    keys:[{mark:"edge",label:"Observed"},{mark:"lit",label:"Fitted"},{mark:"red",label:"Residual"}],
    caption:"25 seeded observations. A least-squares exponential fit; the lower strip shows signed residuals.",
    body:'<svg class="iso-svg" viewBox="0 0 520 330" role="img" aria-label="Response against time with labelled axes and signed residuals"></svg>'});
  const svg=host.querySelector(".iso-plate svg"),ns="http://www.w3.org/2000/svg";
  function add(tag,attrs,text){const e=document.createElementNS(ns,tag);for(const [k,v]of Object.entries(attrs))e.setAttribute(k,String(v));if(text)e.textContent=text;svg.append(e);return e;}
  const X=x=>60+108*x,Y=y=>213-66*y,R=r=>279-150*r;
  const line=(x1,y1,x2,y2,tone="lo")=>add("line",{x1,y1,x2,y2,stroke:\`var(--figure-\${tone})\`,"stroke-width":.6,"vector-effect":"non-scaling-stroke"});
  line(60,35,60,213,"mid");line(60,213,492,213,"mid");
  for(let x=0;x<=4;x++){line(X(x),213,X(x),218);add("text",{x:X(x),y:236,"text-anchor":"middle"},String(x));}
  for(let y=0;y<=2.5;y+=.5){line(55,Y(y),60,Y(y));add("text",{x:48,y:Y(y)+4,"text-anchor":"end"},y.toFixed(1));}
  add("text",{x:60,y:19},"Response / a.u.");add("text",{x:492,y:255,"text-anchor":"end"},"Time / s");
  line(60,279,492,279,"faint");add("text",{x:60,y:310},"Residual / a.u.");add("text",{x:48,y:283,"text-anchor":"end"},"0");
  add("path",{d:Array.from(linspace(0,4,160),(x,i)=>\`\${i?"L":"M"}\${X(x)} \${Y(params[0]*Math.exp(params[1]*x)+params[2])}\`).join(" "),fill:"none",stroke:"var(--figure-lit)","stroke-width":.6,"vector-effect":"non-scaling-stroke"});
  xs.forEach((x,i)=>{add("circle",{cx:X(x),cy:Y(ys[i]),r:3,fill:"var(--figure-paper)",stroke:"var(--figure-hi)","stroke-width":.6,"vector-effect":"non-scaling-stroke"});line(X(x),279,X(x),R(residuals[i]),"red");});
</script>
\`\`\`

## Complete widget: isometric carriage assembly

\`\`\`html
<style>
.demo{max-width:650px;margin:auto;padding:1px 20px;font:14px/1.5 var(--font-sans);color:var(--figure-text)}
.demo .iso-plate{box-shadow:none;border:var(--figure-weight) solid var(--figure-mid)}
.demo .iso-plate-corner{font-size:11px;color:var(--figure-text)}.demo .iso-legend{color:var(--figure-text)}.demo .iso-swatch path{stroke-width:var(--figure-weight)}
canvas{display:block;width:100%;max-width:520px;height:auto;margin:auto}svg text{font:12px var(--figure-mono);fill:var(--figure-text)}
.controls{display:flex;align-items:center;flex-wrap:wrap;gap:8px;margin:12px 0}
button,input{accent-color:var(--figure-lit);font:12px var(--figure-mono)}
button{background:var(--figure-card);color:var(--figure-strong);border:var(--figure-weight) solid var(--figure-mid);padding:6px 12px}
button:focus-visible,input:focus-visible{outline:1px solid var(--figure-hi);outline-offset:3px}
.controls label{display:flex;align-items:center;gap:8px}
@media(max-width:560px){.demo .iso-plate-corner{white-space:normal;max-width:100%;line-height:1.4}.demo .iso-plate-corner[data-corner="hint"]{bottom:28px}.demo .iso-plate{padding-bottom:88px}}
</style>
<main class="iso demo" id="demo"></main>
<script type="module">
  import { ISO_CSS, plateHtml, fitProjection, boxCorners, slabOf, cylinder, solidSvg, figureSvg, lineSvg, lineOnTop } from "/kits/iso.js";
  const host = document.querySelector("#demo");
  const style = document.createElement("style");
  style.textContent = ISO_CSS;
  document.head.append(style);
  const base={x:0,y:0,w:90,d:58,r:5},rail={x:12,y:16,w:66,d:12,r:2},carriage={x:34,y:13,w:22,d:18,r:3};
  const P=fitProjection(boxCorners(base,0,27),520,330,{pad:45});
  const body=[
    solidSvg(slabOf(base,0,6,P),{tone:"lo"}),
    solidSvg(slabOf(rail,6,7,P),{tone:"mid"}),
    solidSvg(slabOf(carriage,13,9,P),{tone:"hi"}),
    solidSvg(cylinder(45,22,5,22,5,P),{tone:"lit",lit:true}),
    lineSvg(lineOnTop([16,42],[74,42],6,P),{tone:"faint"}),
    ...[18,28,38,48,58,68].map(x=>lineSvg(lineOnTop([x,40],[x,44],6,P),{tone:"lo"}))
  ].join("");
  host.innerHTML=plateHtml({fig:"Fig 4",title:"Carriage assembly",hint:"Four facing shades",readout:"x 45 mm · z 27 mm",
    keys:[{mark:"dim",label:"Base"},{mark:"raised",label:"Rail"},{mark:"lit",label:"Adjustment"}],
    caption:"Base, rail, carriage and adjustment knob. Shaded faces show depth.",
    body:figureSvg({width:520,height:330,label:"Small rail carriage assembly with shaded faces",body})});
</script>
\`\`\`
`,
  },
} as const satisfies Record<string, SkillDefinition>;

export type SkillId = keyof typeof SKILL_MAP;

export const AVAILABLE_SKILLS = ["concept-explainer","flashcard-generator","quiz-creator","study-notes-creator","summary-generator","sandbox","chart-comparison","chart-from-spreadsheet","explainer-double-pendulum","chart","explainer","style","visuals","kit-api"] as const;
export const STUDY_SKILLS = ["concept-explainer","flashcard-generator","quiz-creator","study-notes-creator","summary-generator"] as const;
export const VISUAL_SKILLS = ["chart","explainer","style","visuals"] as const;
export const VISUAL_EXAMPLE_SKILLS = ["chart-comparison","chart-from-spreadsheet","explainer-double-pendulum"] as const;
export const TOOL_SKILLS = ["sandbox","kit-api"] as const;
