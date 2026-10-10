export default function PageHeader({
  title,
  description,
}: {
  title: string;
  description?: string;
}) {
  return (
    <header className="mb-8">
      <h1 className="text-3xl font-bold tracking-tight text-slate-900">{title}</h1>
      <div className="mt-2 h-1 w-10 rounded-full bg-indigo-600" />
      {description && <p className="mt-3 text-sm text-slate-500">{description}</p>}
    </header>
  );
}
