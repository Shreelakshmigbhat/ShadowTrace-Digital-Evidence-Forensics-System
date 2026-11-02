"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { callApi } from "@/lib/client";
import type { NoteDoc } from "@/lib/core-service";
import { ErrorBox, btnCls, btnGhostCls, inputCls } from "@/components/evidence/ui";

// Investigator notes, stored in MongoDB. Each edit keeps the previous text in the note's embedded edit_history.
// Edit/delete buttons are shown by role (author or admin may edit; analysts never delete), but the API enforces it.

const when = (iso: string) => new Date(iso).toISOString().slice(0, 16).replace("T", " ") + " UTC";
const splitList = (s: string) => s.split(",").map((x) => x.trim()).filter(Boolean);

function NoteItem({ note, caseId, userId, role }: { note: NoteDoc; caseId: number; userId: number; role: string }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [body, setBody] = useState(note.body);
  const [showHistory, setShowHistory] = useState(false);
  const [error, setError] = useState("");
  const mine = note.author_id === userId;
  const canEdit = role === "ADMIN" || mine;
  const canDelete = role === "ADMIN" || (role === "INVESTIGATOR" && mine);

  async function save() {
    setError("");
    const res = await callApi("PATCH", `/api/investigations/${caseId}/notes/${note.id}`, { body });
    if (res.error) return setError(res.error);
    setEditing(false);
    router.refresh();
  }
  async function remove() {
    if (!confirm("Delete this note?")) return;
    const res = await callApi("DELETE", `/api/investigations/${caseId}/notes/${note.id}`);
    if (res.error) return setError(res.error);
    router.refresh();
  }

  return (
    <li className="rounded border border-slate-200 p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="font-semibold">{note.title || "Untitled note"}</p>
        <p className="text-xs text-slate-500">{note.author_name ?? `user #${note.author_id}`} · {when(note.created_at)}</p>
      </div>

      {editing ? (
        <div className="mt-2 space-y-2">
          <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={4} className={inputCls} />
          <div className="flex gap-2">
            <button onClick={save} className={btnCls}>Save</button>
            <button onClick={() => { setEditing(false); setBody(note.body); }} className={btnGhostCls}>Cancel</button>
          </div>
        </div>
      ) : (
        <p className="mt-1 whitespace-pre-wrap text-sm text-slate-800">{note.body}</p>
      )}

      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {note.tags.map((t) => <span key={t} className="rounded-full bg-violet-100 px-2 py-0.5 text-xs text-violet-800">{t}</span>)}
        {note.evidence_ids.map((id) => (
          <Link key={id} href={`/evidence/${id}`} className="rounded-full bg-blue-100 px-2 py-0.5 text-xs text-blue-800 hover:underline">evidence #{id}</Link>
        ))}
        {note.attachments.map((a) => (
          <span key={a.name} className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-700" title="Metadata only; the file is not stored">
            📎 {a.name}{a.size_kb !== undefined ? ` (${a.size_kb} KB)` : ""}
          </span>
        ))}
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-3 text-xs">
        {note.edit_history.length > 0 && (
          <button onClick={() => setShowHistory(!showHistory)} className="text-slate-500 hover:underline">
            edited {note.edit_history.length}× {showHistory ? "(hide history)" : "(show history)"}
          </button>
        )}
        {canEdit && !editing && <button onClick={() => setEditing(true)} className="text-blue-700 hover:underline">Edit</button>}
        {canDelete && <button onClick={remove} className="text-red-700 hover:underline">Delete</button>}
      </div>

      {showHistory && (
        <ol className="mt-2 space-y-1 border-l-2 border-slate-200 pl-3 text-xs text-slate-600">
          {note.edit_history.map((h, i) => (
            <li key={i}><span className="font-medium">{when(h.edited_at)}</span> - previous text: <span className="italic">“{h.previous_body}”</span></li>
          ))}
        </ol>
      )}
      {error && <div className="mt-2"><ErrorBox message={error} /></div>}
    </li>
  );
}

export default function NotesPanel({
  caseId, notes, userId, role,
}: { caseId: number; notes: NoteDoc[] | null; userId: number; role: string }) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [tags, setTags] = useState("");
  const [evidence, setEvidence] = useState("");
  const [files, setFiles] = useState<{ name: string; size_kb: number; kind: string }[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const evidenceIds = splitList(evidence).map(Number);
    if (evidenceIds.some((n) => !Number.isInteger(n) || n < 1)) {
      setBusy(false);
      return setError("Evidence ids must be whole numbers separated by commas");
    }
    const res = await callApi("POST", `/api/investigations/${caseId}/notes`, {
      title: title || undefined, body, tags: splitList(tags), evidence_ids: evidenceIds, attachments: files,
    });
    setBusy(false);
    if (res.error) return setError(res.error);
    setTitle(""); setBody(""); setTags(""); setEvidence(""); setFiles([]);
    router.refresh();
  }

  if (notes === null) return <ErrorBox message="The notes database (MongoDB) is unavailable. The rest of the case is shown." />;

  return (
    <div className="space-y-4">
      <form onSubmit={add} className="space-y-2 rounded bg-slate-50 p-3">
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title (optional)" maxLength={200} className={inputCls} />
        <textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="Write a note…" rows={3} required className={inputCls} />
        <div className="grid gap-2 sm:grid-cols-2">
          <input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="Tags, comma separated" className={inputCls} />
          <input value={evidence} onChange={(e) => setEvidence(e.target.value)} placeholder="Evidence ids mentioned, e.g. 3, 9" className={inputCls} />
        </div>
        <label className="block text-xs text-slate-600">
          Attachments (only the file name and size are recorded)
          <input type="file" multiple className="mt-1 block text-xs"
            onChange={(e) => setFiles(Array.from(e.target.files ?? []).map((f) => ({ name: f.name, size_kb: Math.round(f.size / 1024), kind: f.type || "file" })))} />
        </label>
        {error && <ErrorBox message={error} />}
        <button disabled={busy || !body.trim()} className={btnCls}>{busy ? "Saving…" : "Add note"}</button>
      </form>

      {notes.length === 0 ? <p className="text-sm text-slate-500">No notes on this case yet.</p> : (
        <ul className="space-y-3">{notes.map((n) => <NoteItem key={n.id} note={n} caseId={caseId} userId={userId} role={role} />)}</ul>
      )}
    </div>
  );
}
