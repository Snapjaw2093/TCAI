// A template is re-created on every page change, so this gives each page a short fade-up entrance.
export default function Template({ children }: { children: React.ReactNode }) {
  return <div className="page-enter">{children}</div>;
}
