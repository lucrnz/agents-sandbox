import * as React from "react";
import { Button } from "@/frontend/components/ui/button";
import { Input } from "@/frontend/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/frontend/components/ui/dialog";
import { AnswerAgentQuestion, type AgentQuestionPayload } from "@/shared/commands";
import type { CommandDef } from "@/shared/command-system";

type SendFn = <TReq, TRes>(command: CommandDef<TReq, TRes>, payload: TReq) => Promise<TRes>;

export function AgentQuestionDialog({
  question,
  send,
  onAnswered,
}: {
  question?: AgentQuestionPayload;
  send: SendFn;
  onAnswered: () => void;
}) {
  const [inputValue, setInputValue] = React.useState("");
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  React.useEffect(() => {
    setInputValue("");
    setIsSubmitting(false);
  }, [question?.questionId]);

  const options =
    question?.options && question.options.length
      ? question.options
      : question
        ? [{ id: "ok", label: "OK" }]
        : [];

  const submit = async (selectedOptionId: string) => {
    if (!question) return;
    setIsSubmitting(true);
    try {
      await send(AnswerAgentQuestion, {
        questionId: question.questionId,
        conversationId: question.conversationId,
        selectedOptionId,
        inputValue: inputValue.trim() || undefined,
      });
      onAnswered();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={!!question}>
      <DialogContent
        className="sm:max-w-[520px]"
        // hard-block closing
        onEscapeKeyDown={(e) => e.preventDefault()}
        onPointerDownOutside={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>{question?.title || "Question"}</DialogTitle>
          <DialogDescription>{question?.message || ""}</DialogDescription>
        </DialogHeader>

        {!!question?.options?.some((o) => o.inputField) && (
          <div className="py-2">
            <Input
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              placeholder={
                question.options?.find((o) => o.inputField)?.inputField?.placeholder ||
                "Type here..."
              }
              autoFocus
              disabled={isSubmitting}
            />
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-2">
          {options.map((o) => (
            <Button
              key={o.id}
              onClick={() => submit(o.id)}
              disabled={isSubmitting}
              variant={o.id === "deny" ? "destructive" : "default"}
            >
              {o.label}
            </Button>
          ))}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
