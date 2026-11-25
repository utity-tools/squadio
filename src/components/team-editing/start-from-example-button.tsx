"use client";

import { LayoutTemplateIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRef } from "react";

import { Button } from "@/components/ui/button";

import type { TeamEditing } from "./team-editing";

/**
 * «Partir de un ejemplo» (board 15): opens the picker of example teams. The empty team is the only
 * place that offers it (docs/domain.md, "Starting from an example team").
 */
export function StartFromExampleButton({ editing }: { editing: TeamEditing }) {
  const t = useTranslations("ExampleTeams");
  const button = useRef<HTMLButtonElement>(null);
  return (
    <Button
      ref={button}
      variant="outline"
      size="sm"
      onClick={() => editing.addExample(button.current)}
    >
      <LayoutTemplateIcon aria-hidden />
      {t("open")}
    </Button>
  );
}
