"use client";

import { useEffect, useMemo, useRef, useSyncExternalStore, type ReactNode } from "react";
import { MessageCircleQuestion } from "lucide-react";
import cardStyles from "./aicss/ApprovalCard.module.css";
import shelfStyles from "./AiliQuestionnaire.module.css";
import { QuestionnaireController } from "../../questionnaire/controller.ts";
import type { ExtensionUiRequest, QuestionnaireUiAnswer, QuestionnaireUiQuestion } from "@/lib/types";
import { useI18n } from "@/hooks/useI18n";

type QuestionnaireRequest = Extract<ExtensionUiRequest, { method: "questionnaire" }>;

/**
 * AILI Unified User Interaction — web presentation of the `questionnaire`
 * model tool. Rendered inline above the composer (no modal overlay: the
 * conversation stays readable and scrollable while the runtime blocks on
 * the answers). One question at a time with a trailing Review tab, driven
 * by the shared questionnaire controller so the flow matches the TUI prompt
 * one-to-one: single-select answers advance, multi-select toggles stay, the
 * custom row opens an inline editor, and ↑/↓/Enter/Space/←/→/Tab/Esc all
 * work. It never auto-dismisses and never invents an answer — unanswered
 * questions go back with empty selections.
 */
export function AiliQuestionnaire({ request, onRespond }: {
  request: QuestionnaireRequest;
  onRespond: (
    request: QuestionnaireRequest,
    response: { answers: QuestionnaireUiAnswer[] } | { cancelled: true },
  ) => void;
}) {
  const { t } = useI18n();
  const cardRef = useRef<HTMLDivElement>(null);
  const customInputRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);

  // The controller lives for the lifetime of the request; the response
  // callback is read through a ref so parent re-renders never reset answers.
  const respondRef = useRef(onRespond);
  respondRef.current = onRespond;
  const controller = useMemo(
    () =>
      new QuestionnaireController(request.questions, ({ cancelled, answers }) => {
        respondRef.current(request, cancelled ? { cancelled: true } : { answers });
      }),
    [request],
  );
  // Bound accessors: React calls subscribe/getSnapshot as plain functions,
  // so passing the class methods directly would lose `this` and crash on
  // mount ("Cannot read properties of undefined").
  const state = useSyncExternalStore(
    (listener) => controller.subscribe(listener),
    () => controller.getSnapshot(),
  );

  useEffect(() => {
    cardRef.current?.focus();
  }, []);

  useEffect(() => {
    if (state.editing) customInputRef.current?.focus();
  }, [state.editing]);

  // Keep the keyboard-focused row visible inside the scrollable body.
  useEffect(() => {
    bodyRef.current?.querySelector<HTMLElement>('[data-active="true"]')?.scrollIntoView({ block: "nearest" });
  }, [state.optionIndex, state.phase, state.index]);

  const questions = request.questions;
  const multi = questions.length > 1 || questions[0]?.multiple === true;
  const question = state.phase === "answer" ? controller.activeQuestion() : undefined;
  const answeredCount = questions.filter((q) => {
    const answer = state.selected.get(q.id);
    return (answer?.size ?? 0) > 0 || state.customInputs.has(q.id);
  }).length;
  const title = questions.length === 1 ? questions[0].header : t("chat.questionnaireCount", { count: questions.length });
  const lastIndex = questions.length - 1;

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (state.editing) {
      if (event.key === "Enter") {
        event.preventDefault();
        controller.commitCustom();
      } else if (event.key === "Escape") {
        event.preventDefault();
        controller.leaveEditing();
      }
      return;
    }
    switch (event.key) {
      case "ArrowUp":
        event.preventDefault();
        controller.moveOption(-1);
        break;
      case "ArrowDown":
        event.preventDefault();
        controller.moveOption(1);
        break;
      case "Enter":
        event.preventDefault();
        if (state.phase === "review") controller.submit();
        else controller.chooseRow();
        break;
      case " ":
        event.preventDefault();
        controller.toggleRow();
        break;
      case "ArrowRight":
        if (!state.simpleSingle) {
          event.preventDefault();
          controller.next();
        }
        break;
      case "ArrowLeft":
        if (!state.simpleSingle) {
          event.preventDefault();
          controller.previous();
        }
        break;
      case "Tab":
        if (!state.simpleSingle) {
          event.preventDefault();
          if (event.shiftKey) controller.previous();
          else controller.next();
        }
        break;
      case "Escape":
        event.preventDefault();
        controller.cancel();
        break;
    }
  };

  const renderOptionRow = (q: QuestionnaireUiQuestion, index: number): ReactNode => {
    const option = q.options[index];
    if (!option) return null;
    const selected = state.selected.get(q.id);
    const isPicked = selected?.has(option.label) === true;
    const isActive = state.phase === "answer" && state.optionIndex === index;
    return (
      <button
        key={option.label}
        type="button"
        role={q.multiple ? "checkbox" : "radio"}
        aria-checked={isPicked}
        className={`${cardStyles.option} ${isActive ? shelfStyles.optionActive : ""}`}
        data-selected={isPicked || undefined}
        data-active={isActive || undefined}
        onClick={() => controller.chooseOption(option.label)}
      >
        <span aria-hidden style={{ flex: "none", fontSize: 12, lineHeight: 1 }}>
          {q.multiple ? (isPicked ? "☑" : "☐") : isPicked ? "◉" : "○"}
        </span>
        <span style={{ display: "flex", flexDirection: "column", gap: 1, minWidth: 0 }}>
          <span>
            {option.label}
            {index === q.recommended && (
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
  };

  const renderCustomRow = (q: QuestionnaireUiQuestion): ReactNode => {
    const saved = state.customInputs.get(q.id);
    const isActive = state.phase === "answer" && state.optionIndex === q.options.length;
    return (
      <div key="__custom" style={{ display: "flex", flexDirection: "column", gap: 5 }}>
        <button
          type="button"
          className={`${cardStyles.option} ${isActive ? shelfStyles.optionActive : ""}`}
          data-selected={saved !== undefined || undefined}
          data-active={isActive || undefined}
          onClick={() => controller.beginEditing()}
        >
          <span aria-hidden style={{ flex: "none", fontSize: 12, lineHeight: 1 }}>✎</span>
          <span style={{ fontSize: 12.5, color: saved ? undefined : "#a1a1a1", overflowWrap: "anywhere" }}>
            {saved ?? t("chat.questionnaireCustom")}
          </span>
        </button>
        {state.editing && (
          <div className={shelfStyles.customEditor}>
            <input
              ref={customInputRef}
              value={state.customDraft}
              placeholder={t("chat.questionnaireCustomPlaceholder")}
              className={shelfStyles.customInput}
              onChange={(event) => controller.setCustomDraft(event.target.value)}
            />
            <span className={shelfStyles.customHint}>{t("chat.questionnaireCustomHint")}</span>
          </div>
        )}
      </div>
    );
  };

  return (
    <div
      ref={cardRef}
      tabIndex={-1}
      className={cardStyles.card}
      style={{ outline: "none" }}
      onKeyDown={handleKeyDown}
    >
      <div className={cardStyles.head}>
        <span className={cardStyles.icon} data-variant="questions">
          <MessageCircleQuestion size={16} strokeWidth={1.8} aria-hidden />
        </span>
        <span className={cardStyles.title}>{title}</span>
        {multi && (
          <span className={shelfStyles.progress}>
            {answeredCount}/{questions.length}
          </span>
        )}
      </div>

      {!state.simpleSingle && (
        <div className={shelfStyles.stepper} role="tablist" aria-label={t("chat.questionnaireReview")}>
          {questions.map((q, i) => {
            const answered = (state.selected.get(q.id)?.size ?? 0) > 0 || state.customInputs.has(q.id);
            const current = state.phase === "answer" && state.index === i;
            return (
              <button
                key={q.id}
                type="button"
                role="tab"
                aria-selected={current}
                className={shelfStyles.stepChip}
                data-current={current || undefined}
                data-answered={answered || undefined}
                onClick={() => controller.jumpTo(i)}
              >
                {i + 1}
              </button>
            );
          })}
          <button
            type="button"
            role="tab"
            aria-selected={state.phase === "review"}
            className={shelfStyles.stepChip}
            data-current={state.phase === "review" || undefined}
            onClick={() => controller.enterReview()}
          >
            {t("chat.questionnaireReview")}
          </button>
        </div>
      )}

      <div className={shelfStyles.body} ref={bodyRef}>
        {question ? (
          <>
            <div className={shelfStyles.prompt}>
              {multi && <span className={shelfStyles.promptHeader}>{question.header}</span>}
              <span className={shelfStyles.promptText}>{question.question}</span>
              {question.multiple && (
                <span className={shelfStyles.promptHint}>{t("chat.questionnaireSelectAll")}</span>
              )}
            </div>
            <div
              className={cardStyles.options}
              role={question.multiple ? "group" : "radiogroup"}
              aria-label={question.question}
            >
              {question.options.map((_, index) => renderOptionRow(question, index))}
              {renderCustomRow(question)}
            </div>
          </>
        ) : (
          <div className={shelfStyles.review}>
            <span className={shelfStyles.reviewTitle}>{t("chat.questionnaireReviewTitle")}</span>
            {questions.map((q, i) => {
              const selected = [...(state.selected.get(q.id) ?? [])];
              const custom = state.customInputs.get(q.id);
              const values = [...selected, ...(custom ? [custom] : [])];
              return (
                <div key={q.id} className={shelfStyles.reviewRow}>
                  <span className={shelfStyles.reviewHeader}>{i + 1}. {q.header}</span>
                  <span className={shelfStyles.reviewValue} data-empty={values.length === 0 || undefined}>
                    {values.length > 0 ? values.join(", ") : t("chat.questionnaireUnanswered")}
                  </span>
                  <button type="button" className={shelfStyles.reviewEdit} onClick={() => controller.jumpTo(i)}>
                    {t("chat.questionnaireEdit")}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className={cardStyles.actions}>
        <button type="button" className={cardStyles.btnGhost} onClick={() => controller.cancel()}>
          {t("chat.cancel")}
        </button>
        <div className={shelfStyles.navBtns}>
          {!state.simpleSingle && (state.phase === "review" || state.index > 0) && (
            <button type="button" className={cardStyles.btnGhost} onClick={() => controller.previous()}>
              {t("chat.questionnaireBack")}
            </button>
          )}
          {state.phase === "review" ? (
            <button type="button" className={cardStyles.btnPrimary} onClick={() => controller.submit()}>
              {t("chat.questionnaireSubmitAnswers")}
            </button>
          ) : state.simpleSingle ? (
            <button type="button" className={cardStyles.btnPrimary} onClick={() => controller.submit()}>
              {t("chat.submit")}
            </button>
          ) : (
            <button
              type="button"
              className={cardStyles.btnPrimary}
              onClick={() => (state.index === lastIndex ? controller.enterReview() : controller.next())}
            >
              {state.index === lastIndex ? t("chat.questionnaireReview") : t("chat.questionnaireNext")} →
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
