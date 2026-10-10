import Icon from "@/components/Icon";

export default function EmptyState({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center">
      <span className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600">
        <Icon name="inbox" className="h-6 w-6" />
      </span>
      <h2 className="text-base font-bold text-slate-900">{title}</h2>
      <p className="mt-1 text-sm text-slate-500">{description}</p>
    </div>
  );
}
