// Page container for the evidence pages. The navigation bar is shared by every page and lives in app/layout.tsx.
export default function EvidenceLayout({ children }: { children: React.ReactNode }) {
  return <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>;
}
