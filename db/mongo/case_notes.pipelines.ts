// case_notes.pipelines.ts (Member B)
// Aggregation pipelines over case_notes. The arrays are exported so API routes can reuse them;
// running this file directly prints each result:  npm run mongo:pipelines
import { MongoClient } from "mongodb";
import { pathToFileURL } from "node:url";

// 1. Notes written per investigator per month.
//    $group on a compound key (author + month); $dateToString turns the date into "2025-03".
export const notesPerAuthorPerMonth = [
  {
    $group: {
      _id: { author_id: "$author_id", month: { $dateToString: { format: "%Y-%m", date: "$created_at" } } },
      notes: { $sum: 1 },
    },
  },
  { $project: { _id: 0, author_id: "$_id.author_id", month: "$_id.month", notes: 1 } },
  { $sort: { month: 1, notes: -1, author_id: 1 } },
];

// 2. Most-used tags (top 10). $unwind turns each tag in tags[] into its own document first.
export const topNoteTags = [
  { $unwind: "$tags" },
  { $group: { _id: "$tags", uses: { $sum: 1 } } },
  { $sort: { uses: -1, _id: 1 } }, // _id ascending breaks ties alphabetically
  { $limit: 10 },
  { $project: { _id: 0, tag: "$_id", uses: 1 } },
];

// 3. Most-mentioned evidence ids across all notes (top 10): which items investigators keep coming back to.
export const mostMentionedEvidence = [
  { $unwind: "$evidence_ids" },
  { $group: { _id: "$evidence_ids", mentions: { $sum: 1 }, cases: { $addToSet: "$investigation_id" } } },
  { $project: { _id: 0, evidence_id: "$_id", mentions: 1, cases: { $size: "$cases" } } },
  { $sort: { mentions: -1, evidence_id: 1 } },
  { $limit: 10 },
];

async function main() {
  const client = new MongoClient(process.env.MONGODB_URI!);
  try {
    const col = client.db(process.env.MONGODB_DB).collection("case_notes");
    for (const [title, pipeline] of [
      ["Notes per investigator per month", notesPerAuthorPerMonth],
      ["Most-used tags", topNoteTags],
      ["Most-mentioned evidence", mostMentionedEvidence],
    ] as const) {
      console.log(`\n== ${title}`);
      console.table(await col.aggregate([...pipeline]).toArray());
    }
  } finally {
    await client.close();
  }
}

// Importing this file (from an API route) must NOT run main(); only `node <this file>` does.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
