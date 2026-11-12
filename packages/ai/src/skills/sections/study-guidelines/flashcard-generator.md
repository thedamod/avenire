---
name: flashcard-generator
description: Create flashcards for spaced repetition learning using concise markdown front/back cards with optional notes and source citations. Use when creating study flashcards, vocabulary cards, memorization aids, or spaced repetition materials from notes or topics. Triggers - create flashcards, make flashcards, spaced repetition, memory cards, study cards.
---

# Flashcard Creator

Generate effective flashcards optimized for spaced repetition learning.

Avenire is not a flashcard app: cards are a by-product of studying, written by Ava Cloud
as an artifact file. Write them as a JSON array of
`{ "front": string, "back": string, "notes"?: string, "sourceFileIds": string[] }`, with
markdown allowed in `front`, `back` and `notes`. Every card cites the files it came from.

## Workflow

```mermaid
flowchart LR
    A[Source Material] --> B[Identify Key Facts]
    B --> C[Choose Card Type]
    C --> D[Create Cards]
    D --> E[Add Mnemonics]
    E --> F[Write the JSON artifact]
```

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

```
Front: What is the powerhouse of the cell?
Back: Mitochondria
```

### Reversed Card (Both Directions)

```
Front: Mitochondria
Back: The powerhouse of the cell - produces ATP through cellular respiration
```

### Cloze Deletion

```
Text: The {{c1::mitochondria}} is the powerhouse of the cell, producing {{c2::ATP}}.
```

Use cloze-like prompts sparingly and only when a deletion-style cue is clearly better than a standard question/answer card. Prefer straightforward prompts when possible.

---

## Step 3: Card Templates by Subject

### Vocabulary/Terminology

```
Front: [Term]
Back:
- Definition: [Clear definition]
- Example: [Usage in context]
- Related: [Connected terms]
```

### Formulas

```
Front: Formula for [concept]?
Back:
[Formula]
Where:
- [Variable] = [meaning]
```

### Processes/Sequences

```
Front: What are the steps of [process]?
Back:
1. [Step 1]
2. [Step 2]
3. [Step 3]
Mnemonic: [Memory aid]
```

### Dates/Events

```
Front: [Year]: What happened?
Back: [Event and significance]
```

OR

```
Front: When did [event] occur?
Back: [Year] - [Brief context]
```

---

## Step 4: Mnemonic Techniques

### Acronyms

```
Front: Order of operations in math?
Back: PEMDAS - Parentheses, Exponents, Multiplication, Division, Addition, Subtraction
```

### Visual Association

```
Front: What is the symbol for Iron on the periodic table?
Back: Fe (think: "Fe"rris wheel made of iron)
```

### Story Method

```
Front: Stages of mitosis in order?
Back: PMAT - "Please Make Another Taco"
Prophase → Metaphase → Anaphase → Telophase
```

---

## Step 5: Output Format

Each card is one object in the artifact's JSON array:

```json
{
  "front": "What is DNA?",
  "back": "Deoxyribonucleic acid - carries genetic information.",
  "notes": "Think \"de-oxy-ribo\" for the sugar backbone.",
  "sourceFileIds": ["file_..."]
}
```

### Markdown guidance

- Keep `front` short and testable.
- Keep `back` concise, but complete enough to stand alone.
- Put memory hooks, mnemonics, or one small example in `notes` instead of bloating the answer.
- Use bullets in `back` only when the answer genuinely needs a short list.

---

## Step 6: Batch Generation Template

When creating multiple cards from a topic:

````markdown
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
- [ ] Any equations use `$...$` or `$$...$$` formatting, never ```latex fences
````
