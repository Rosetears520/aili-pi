"use client";

import { useState } from "react";
import { MessageCircleQuestion } from "lucide-react";
import cardStyles from "./aicss/ApprovalCard.module.css";
import type { ExtensionUiRequest, QuestionnaireUiAnswer, QuestionnaireUiQuestion } from "@/lib/types";
import { useI18n } from "@/hooks/useI18n";

type QuestionnaireRequest = Extract<ExtensionUiRequest, { method: "questionnaire" }>;

const CUSTOM_LABEL = "Type your own answer";

/**
 * AILI Unified User Interaction — web presentation of the `questionnaire`
 * model tool. Renders every question on one card (single-select as radio
 * rows, multi-select as toggle rows, free-form input per question) and
 * returns structured answers; it never auto-dismisses and never invents an
 * answer — unanswered questions go back with empty selections.
 * Shell classes are shared with the vendored AIcss ApprovalCard so both
 * approval surfaces stay visually identical.
 */
export function AiliQuestionnaire({ request, onRespond }: {
  request: QuestionnaireRequest;
  onRespond: (
    request: QuestionnaireRequest,
    response: { answers: QuestionnaireUiAnswer[] } | { cancelled: true },
  ) => void;
}) {
  const { t } = useI18n();
  const [selected, setSelected] = useState<Record<string, string[]>>(() =>
    Object.fromEntries(request.questions.map((question) => [question.id, []])));
  const [customs, setCustoms] = useState<Record<string, string>>({});

  const toggle = (question: QuestionnaireUiQuestion, label: string) => {
    setSelected((prev) => {
      const current = prev[question.id] ?? [];
      if (!question.multiple) {
        const next = current.includes(label) ? [] : [label];
        if (!current.includes(label) || next.length === 0) {
          setCustoms((prior) => {
            const copy = { ...prior };
            delete copy[question.id];
            return copy;
          });
        }
        return { ...prev, [question.id]: next };
      }
      const next = current.includes(label)
        ? current.filter((value) => value !== label)
        : [...current, label];
      return { ...prev, [question.id]: next };
    });
  };

  const submit = () => {
    const answers = request.questions.map((question): QuestionnaireUiAnswer => {
      const picks = (selected[question.id] ?? []).filter((label) => label !== CUSTOM_LABEL);
      const custom = customs[question.id]?.trim();
      return {
        id: question.id,
        selectedOptions: picks,
        ...(custom ? { customInput: custom } : {}),
      };
    });
    onRespond(request, { answers });
  };

  const count = request.questions.length;
  const title = count === 1 ? request.questions[0].header : `${count} questions`;

  return (
    <div className={cardStyles.card}>
      <div className={cardStyles.head}>
        <span className={cardStyles.icon} data-variant="questions">
          <MessageCircleQuestion size={16} strokeWidth={1.8} aria-hidden />
        </span>
        <span className={cardStyles.title}>{title}</span>
        <span className={cardStyles.actionsSpacer} />
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 14, padding: "6px 0 2px" }}>
        {request.questions.map((question) => (
          <div key={question.id} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              {count > 1 && (
                <span style={{ fontSize: 10.5, fontWeight: 650, color: "#a1a1a1", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                  {question.header}
                </span>
              )}
              <span style={{ fontSize: 13.5, lineHeight: 1.45 }}>{question.question}</span>
              {question.multiple && (
                <span style={{ fontSize: 11.5, color: "#a1a1a1" }}>{t("chat.questionnaireSelectAll")}</span>
              )}
            </div>

            <div className={cardStyles.options}>
              {question.options.map((option, index) => {
                const isPicked = (selected[question.id] ?? []).includes(option.label);
                return (
                  <button
                    key={option.label}
                    type="button"
                    className={cardStyles.option}
                    data-selected={isPicked || undefined}
                    onClick={() => toggle(question, option.label)}
                  >
                    <span aria-hidden style={{ flex: "none", fontSize: 12, lineHeight: 1 }}>
                      {question.multiple ? (isPicked ? "☑" : "☐") : isPicked ? "◉" : "○"}
                    </span>
                    <span style={{ display: "flex", flexDirection: "column", gap: 1, minWidth: 0 }}>
                      <span>
                        {option.label}
                        {index === question.recommended && (
                          <span style={{ fontSize: 10.5, color: "#a1a1a1", marginLeft: 6 }}>
                            ({t("chat.questionnaireRecommended")})
                          </span>
                        )}
                      </span>
                      {option.description && (
                        <span style={{ fontSize: 11.5, color: "#a1a1a1", lineHeight: 1.35 }}>{option.description}</span>
                      )}
                    </span>
                  </button>
                );
              })}

              <button
                type="button"
                className={cardStyles.option}
                data-selected={(selected[question.id] ?? []).includes(CUSTOM_LABEL) || undefined}
                onClick={() => toggle(question, CUSTOM_LABEL)}
              >
                <span aria-hidden style={{ flex: "none", fontSize: 12, lineHeight: 1 }}>✎</span>
                <span style={{ fontSize: 12.5, color: "#a1a1a1" }}>{t("chat.questionnaireCustom")}</span>
              </button>
              {(selected[question.id] ?? []).includes(CUSTOM_LABEL) && (
                <input
                  autoFocus
                  value={customs[question.id] ?? ""}
                  placeholder={t("chat.questionnaireCustomPlaceholder")}
                  onChange={(event) => setCustoms((prev) => ({ ...prev, [question.id]: event.target.value }))}
                  style={{
                    width: "100%",
                    padding: "7px 9px",
                    borderRadius: 7,
                    border: "0.5px solid rgba(0, 0, 0, 0.12)",
                    background: "transparent",
                    color: "inherit",
                    font: "inherit",
                    fontSize: 12.5,
                    outline: "none",
                  }}
                />
              )}
            </div>
          </div>
        ))}
      </div>

      <div className={cardStyles.actions}>
        <span className={cardStyles.actionsSpacer} />
        <button type="button" className={cardStyles.btnGhost} onClick={() => onRespond(request, { cancelled: true })}>
          {t("chat.cancel")}
        </button>
        <button type="button" className={cardStyles.btnPrimary} onClick={submit}>
          {t("chat.submit")}
        </button>
      </div>
    </div>
  );
}
