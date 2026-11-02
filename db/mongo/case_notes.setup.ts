// case_notes.setup.ts (Member B)
// Creates the `case_notes` collection with a $jsonSchema validator and its indexes. Safe to run many times.
// Run:  npm run mongo:setup
//
// DOCUMENT MODEL (one document per note; many notes per investigation):
//   investigation_id  int      -> investigations.id in MySQL (the link between the two databases)
//   author_id         int      -> users.id in MySQL
//   title             string   optional short heading
//   body              string   free text written by the investigator (required)
//   tags[]            strings  e.g. "malware", "interview", "follow-up"
//   evidence_ids[]    ints     evidence.id values the note talks about
//   attachments[]     { name, size_kb, kind }   metadata only; files themselves are not stored
//   created_at, updated_at     dates
//   edit_history[]    { edited_at, edited_by, previous_body }   every edit keeps the old text (audit)
import { MongoClient } from "mongodb";

const INT = ["int", "long"];

const validator = {
  $jsonSchema: {
    bsonType: "object",
    required: ["investigation_id", "author_id", "body", "created_at"],
    properties: {
      investigation_id: { bsonType: INT, minimum: 1, description: "MySQL investigations.id" },
      author_id: { bsonType: INT, minimum: 1, description: "MySQL users.id" },
      title: { bsonType: "string", maxLength: 200 },
      body: { bsonType: "string", minLength: 1, maxLength: 20000 },
      tags: { bsonType: "array", maxItems: 30, items: { bsonType: "string", minLength: 1, maxLength: 40 } },
      evidence_ids: { bsonType: "array", maxItems: 100, items: { bsonType: INT, minimum: 1 } },
      attachments: {
        bsonType: "array",
        maxItems: 20,
        items: {
          bsonType: "object",
          required: ["name"],
          properties: {
            name: { bsonType: "string", minLength: 1, maxLength: 255 },
            size_kb: { bsonType: ["int", "long", "double"], minimum: 0 },
            kind: { bsonType: "string", maxLength: 50 },
          },
        },
      },
      created_at: { bsonType: "date" },
      updated_at: { bsonType: "date" },
      edit_history: {
        bsonType: "array",
        items: {
          bsonType: "object",
          required: ["edited_at", "edited_by", "previous_body"],
          properties: {
            edited_at: { bsonType: "date" },
            edited_by: { bsonType: INT },
            previous_body: { bsonType: "string" },
          },
        },
      },
    },
  },
};

const client = new MongoClient(process.env.MONGODB_URI!);
try {
  const db = client.db(process.env.MONGODB_DB);
  const name = "case_notes";
  const exists = (await db.listCollections({ name }).toArray()).length > 0;

  if (!exists) {
    // validationAction 'error' = reject the write. ('warn' would only log it.)
    await db.createCollection(name, { validator, validationLevel: "strict", validationAction: "error" });
    console.log("created case_notes with validator");
  } else {
    await db.command({ collMod: name, validator, validationLevel: "strict", validationAction: "error" });
    console.log("updated validator on existing case_notes");
  }

  const col = db.collection(name);
  // The timeline of one case, newest note first: the query the case page runs.
  await col.createIndex({ investigation_id: 1, created_at: -1 }, { name: "idx_case_time" });
  // Multikey index (one entry per array element): "all notes tagged X".
  await col.createIndex({ tags: 1 }, { name: "idx_tags" });
  // Text index: keyword search inside notes. A collection can have only ONE text index, so it covers title and body.
  await col.createIndex({ body: "text", title: "text" }, { name: "ft_notes", weights: { title: 3, body: 1 } });
  console.log("indexes:", (await col.indexes()).map((i) => i.name).join(", "));
} finally {
  await client.close();
}
