# Why investigator case notes live in MongoDB

This is the second MongoDB collection in ShadowTrace. The first, `evidence_artifacts`, is described in [`db/mongo/JUSTIFICATION.md`](../db/mongo/JUSTIFICATION.md).

## What a note looks like

```js
{
  investigation_id: 2,                 // -> investigations.id (MySQL)
  author_id: 3,                        // -> users.id (MySQL)
  title: "Ransomware initial triage",
  body: "Encrypted files carry the .locked extension. ...",
  tags: ["malware", "ransomware", "wallet"],
  evidence_ids: [3, 9],                // -> evidence.id (MySQL)
  attachments: [{ name: "ransom_note.txt", size_kb: 2, kind: "text" }],
  created_at: ISODate("2025-01-21T09:40:00Z"),
  updated_at: ISODate("2025-01-21T09:40:00Z"),
  edit_history: [ { edited_at, edited_by, previous_body } ]   // grows with every edit
}
```

## Why this belongs in MongoDB

**The shape differs from note to note.** One note is a single sentence. Another has a title, six tags, three mentioned evidence ids and two attachments. A third has been edited four times. Relationally, this is four tables (`notes`, `note_tags`, `note_evidence`, `note_attachments`) plus a fifth for edit history, and every screen that shows a note joins all five. In MongoDB the note is one document, and one read returns everything the page needs. Arrays of tags, evidence ids and attachments are native values, not child tables.

**The note and its edit history are one unit.** Each edit pushes the previous text into `edit_history` with `$push`, in the same atomic single-document update that changes `body`. A reader can never see a new body without its history entry. The embedded history also stays small and bounded by how often a person edits one note, which is exactly when embedding is the right design.

**Notes are written and read as a whole.** The access patterns are "show the notes of case 7, newest first", "all notes tagged `wallet`", and "search the text for a word". Each maps to one index: `{investigation_id, created_at: -1}`, a multikey index on `tags`, and a text index on `title` and `body`. None of them needs a join to answer.

**Aggregation over arrays is short.** "Most-used tags" and "most-mentioned evidence" are `$unwind` + `$group` + `$sort`. The same questions over child tables need a join and a `GROUP BY` each, and over a MySQL `JSON` column need `JSON_TABLE`.

**The schema still has rules.** The collection has a `$jsonSchema` validator with `validationAction: "error"`. `investigation_id`, `author_id`, `body` and `created_at` are required, tags must be strings, and evidence ids must be integers. MongoDB rejects anything else with error 121, so flexible does not mean unchecked.

## Why the integrity-critical data stays in MySQL

Who may see or close a case, which evidence belongs to it, and the audit trail of changes need foreign keys, transactions and triggers. The investigation itself, its timeline of status changes, its links to evidence and assets, and every user account therefore live in MySQL. A note is commentary about that record, not part of it.

## The link between the two databases

Each note carries `investigation_id`, `author_id` and `evidence_ids`, which are MySQL primary keys. MongoDB cannot enforce a foreign key, so the API checks that the investigation exists, and that the author is an active user, in MySQL before it writes a note. Reading a case combines both: the case, its timeline, evidence and assets come from `CALL get_case_summary(...)`, and the notes come from `case_notes`, joined in the API by `investigation_id`.

## Collections and indexes at a glance

| Index | Key | Speeds up |
|---|---|---|
| `idx_case_time` | `{investigation_id: 1, created_at: -1}` | Notes of one case, newest first |
| `idx_tags` | `{tags: 1}` (multikey) | Notes with a given tag |
| `ft_notes` | `{title: "text", body: "text"}`, title weighted 3x | Keyword search in notes |

## Aggregation pipelines (`db/mongo/case_notes.pipelines.ts`)

| Pipeline | Question |
|---|---|
| `notesPerAuthorPerMonth` | How many notes did each investigator write each month? |
| `topNoteTags` | Which tags are used most? |
| `mostMentionedEvidence` | Which evidence ids do notes mention most, and in how many cases? |
