// case_notes.seed.ts (Member B)
// Inserts sample investigator notes for the seeded investigations (ids 1-10 in MySQL).
// Evidence ids mentioned in each note are ones that case is linked to in 92_seed_links.sql.
// Run after mongo:setup:  npm run mongo:seed      (re-running replaces the seed notes)
import { MongoClient } from "mongodb";

type Note = {
  investigation_id: number;
  author_id: number;
  title?: string;
  body: string;
  tags: string[];
  evidence_ids: number[];
  attachments: { name: string; size_kb: number; kind: string }[];
  created_at: Date;
  updated_at: Date;
  edit_history: { edited_at: Date; edited_by: number; previous_body: string }[];
};

const d = (s: string) => new Date(s + "Z");
const note = (
  investigation_id: number, author_id: number, created: string, title: string, body: string,
  tags: string[], evidence_ids: number[] = [], attachments: Note["attachments"] = [],
  edit?: { at: string; previous: string },
): Note => ({
  investigation_id, author_id, title, body, tags, evidence_ids, attachments,
  created_at: d(created),
  updated_at: d(edit ? edit.at : created),
  edit_history: edit ? [{ edited_at: d(edit.at), edited_by: author_id, previous_body: edit.previous }] : [],
});

const notes: Note[] = [
  note(1, 2, "2025-01-14T10:30:00", "First look at payroll export",
    "Exported payroll shows 14 beneficiary accounts that share three bank account numbers. Disk image hash verified before analysis.",
    ["fraud", "hash-verified", "payroll"], [1, 2], [{ name: "payroll_dups.csv", size_kb: 48, kind: "spreadsheet" }]),
  note(1, 6, "2025-01-18T15:10:00", "Mailbox review",
    "The finance mailbox contains approval emails sent from an address that looks like the CFO but uses a different domain.",
    ["fraud", "email", "spoofing"], [4]),
  note(1, 2, "2025-02-02T09:00:00", "Interview summary",
    "Payroll clerk says approvals were always received by email. No signed paper copies exist.",
    ["interview", "follow-up"], [], [], { at: "2025-02-03T08:00:00", previous: "Payroll clerk says approvals were received by email." }),
  note(2, 3, "2025-01-21T09:40:00", "Ransomware initial triage",
    "Encrypted files carry the .locked extension. Ransom note points to a wallet. Network capture from the gateway shows beaconing every 60 seconds.",
    ["malware", "ransomware", "wallet"], [3, 9], [{ name: "ransom_note.txt", size_kb: 2, kind: "text" }]),
  note(2, 7, "2025-01-25T16:20:00", "Initial access",
    "A service account logged in at 02:14 from an unusual address. The same account appears in an earlier unrelated case.",
    ["malware", "service-account", "timeline"], [15]),
  note(2, 3, "2025-02-04T11:00:00", "Containment",
    "Affected server isolated. Backup integrity verified: last clean snapshot is two days before the infection.",
    ["containment", "hash-verified"], [21]),
  note(3, 2, "2025-02-05T10:00:00", "Transfer pattern",
    "Employee uploaded about 4 GB to a personal cloud account over three weekends. Timestamps match badge-in records.",
    ["insider-threat", "data-exfiltration", "timeline"], [1, 7]),
  note(3, 8, "2025-02-10T11:45:00", "Access review",
    "Employee had repository access for six months with no access change requests logged.",
    ["insider-threat", "follow-up"], [13]),
  note(4, 4, "2025-02-20T14:00:00", "Phishing sample analysis",
    "Credential-harvesting page imitates the HR portal. Hosting provider contacted for takedown.",
    ["phishing", "email", "takedown"], [10], [{ name: "phish_headers.txt", size_kb: 6, kind: "text" }]),
  note(4, 6, "2025-03-10T15:30:00", "Takedown confirmed",
    "Domain suspended. Eleven staff members entered credentials before the takedown; passwords reset.",
    ["phishing", "resolved"], [16]),
  note(5, 5, "2025-03-05T09:20:00", "Unknown host",
    "The login source is not in the asset register. Camera server shows no footage deleted so far.",
    ["physical-access", "cctv", "follow-up"], [5, 11]),
  note(5, 5, "2025-04-15T13:10:00", "Placed on hold",
    "Waiting for the vendor to export firewall logs. Case on hold until they arrive.",
    ["on-hold", "cctv"], [17]),
  note(6, 2, "2025-03-20T10:30:00", "Invoice comparison",
    "Three invoices use the same layout and the same bank account but different company names.",
    ["fraud", "document", "invoices"], [6, 12]),
  note(6, 7, "2025-03-28T17:00:00", "Beneficiary account",
    "The beneficiary account was opened two weeks before the first invoice. Bank has been asked for account opening records.",
    ["fraud", "follow-up", "financial-fraud"], [18]),
  note(7, 3, "2025-04-07T12:10:00", "Device image",
    "Mobile image shows the phone synced with the laptop. Disk on the laptop was encrypted with a strong password.",
    ["encrypted-comms", "device", "hash-verified"], [8, 14]),
  note(8, 5, "2025-05-14T10:40:00", "Wallet overview",
    "Suspect wallet received funds from three other reported cases. Transactions are consolidated within an hour.",
    ["wallet", "financial-fraud", "timeline"], [19]),
  note(8, 8, "2025-05-20T14:15:00", "Cross-case link",
    "The same ransom wallet is mentioned in the file server ransomware case. Recommend joint review.",
    ["wallet", "ransomware", "follow-up"], [20, 2], [{ name: "wallet_graph.png", size_kb: 210, kind: "image" }]),
  note(9, 4, "2025-06-05T09:00:00", "Documents pending",
    "Waiting for originals from procurement. Scanned copies show inconsistent fonts.",
    ["document", "follow-up"], []),
  note(10, 2, "2025-06-16T09:30:00", "Defacement analysis",
    "Web server log shows the attacker used an outdated plugin. Attack came from a single address.",
    ["web", "malware", "timeline"], [22]),
  note(10, 2, "2025-07-30T17:15:00", "Closure",
    "Plugin patched, credentials rotated, monitoring enabled. Case closed.",
    ["resolved", "web"], [25]),
];

const client = new MongoClient(process.env.MONGODB_URI!);
try {
  const col = client.db(process.env.MONGODB_DB).collection("case_notes");
  await col.deleteMany({});
  const r = await col.insertMany(notes);
  console.log(`inserted ${r.insertedCount} notes`);

  // Validation demo (screenshot this): Mongo itself rejects bad notes.
  const bad = [
    { label: "missing body", doc: { investigation_id: 1, author_id: 2, created_at: new Date() } },
    { label: "investigation_id is text", doc: { investigation_id: "one", author_id: 2, body: "x", created_at: new Date() } },
    { label: "tags contains a number", doc: { investigation_id: 1, author_id: 2, body: "x", tags: [7], created_at: new Date() } },
  ];
  for (const b of bad) {
    try {
      await col.insertOne(b.doc as any);
      console.log(`UNEXPECTED: "${b.label}" was accepted`);
    } catch (e: any) {
      console.log(`rejected as expected (${b.label}): code ${e.code} ${e.codeName}`); // 121 DocumentValidationFailure
    }
  }
} finally {
  await client.close();
}
