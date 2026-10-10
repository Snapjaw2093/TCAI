"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import TransactionForm, { type EditTarget } from "@/components/TransactionForm";
import { db } from "@/lib/data";

export default function EditTransaction({ id }: { id: string }) {
  const [target, setTarget] = useState<EditTarget | null | undefined>(undefined);

  useEffect(() => {
    async function load() {
      const transaction = await db.getTransaction(id);
      if (!transaction) {
        setTarget(null);
        return;
      }
      const people = await db.listPeople();
      setTarget({
        transaction,
        client: people.find((p) => p.id === transaction.clientId),
        agent: people.find((p) => p.id === transaction.agentId),
      });
    }
    load();
  }, [id]);

  if (target === undefined) return <p className="text-sm text-slate-500">Loading…</p>;
  if (target === null) {
    return (
      <div>
        <p className="text-slate-700">We couldn&apos;t find that transaction.</p>
        <Link href="/transactions" className="text-sm text-indigo-600 hover:underline">
          Back to transactions
        </Link>
      </div>
    );
  }
  // The key remounts the form with fresh values whenever the saved deal changes.
  return <TransactionForm key={JSON.stringify(target)} editing={target} />;
}
