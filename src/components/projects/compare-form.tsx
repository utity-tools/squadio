"use client";

import { useTranslations } from "next-intl";
import { type FormEvent, useId, useState } from "react";

import { Button } from "@/components/ui/button";

// docs/domain.md, "Comparing scenarios": the project's Escenarios table ticks two or three of them.
// The ticks live in the table and join this form through their `form` attribute, so the form never
// wraps the table's own buttons. A plain GET: it works without JavaScript, and the comparison page
// says so itself when the count is wrong.

export const PICKED = "s";

type CompareFormProps = {
  id: string;
  /** The comparison page's path, with its locale. */
  action: string;
  /** `?access=` of the project's page, which can only take rate access away. */
  access?: string;
};

export function CompareForm({ id, action, access }: CompareFormProps) {
  const t = useTranslations("Comparison.pick");
  const [refusal, setRefusal] = useState<"tooFew" | "tooMany" | null>(null);
  const hintId = useId();

  const submit = (event: FormEvent<HTMLFormElement>) => {
    // The ticks join the form through their `form` attribute, so its data holds them.
    const picked = new FormData(event.currentTarget).getAll(PICKED).length;
    const wrong = picked < 2 ? "tooFew" : picked > 3 ? "tooMany" : null;
    setRefusal(wrong);
    if (wrong) event.preventDefault();
  };

  return (
    <form
      id={id}
      method="get"
      action={action}
      onSubmit={submit}
      className="flex flex-wrap items-center gap-x-3 gap-y-1"
    >
      {access !== undefined && <input type="hidden" name="access" value={access} />}
      <Button type="submit" variant="outline" size="sm" aria-describedby={hintId}>
        {t("submit")}
      </Button>
      <p id={hintId} role="status" className="text-[13px] text-muted-foreground">
        {t(refusal ?? "hint")}
      </p>
    </form>
  );
}
