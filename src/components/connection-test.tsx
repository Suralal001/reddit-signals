"use client";

import { useState, useTransition } from "react";
import { testRedditConnection } from "@/lib/actions";

export function ConnectionTest() {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  return (
    <div className="mt-3">
      <button
        type="button"
        className="btn-secondary w-full justify-center text-xs"
        disabled={pending}
        onClick={() => start(async () => setResult(await testRedditConnection()))}
      >
        {pending ? "Testing…" : "Test Reddit connection"}
      </button>
      {result && (
        <div className={`mt-2 text-xs ${result.ok ? "text-good" : "text-hot"}`}>{result.message}</div>
      )}
    </div>
  );
}
