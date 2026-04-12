import type { FeishuApiClient } from "./client.js";
import type { QuizCardState, QuizQuestion } from "./cards/templates/quiz-v1.js";

export interface QuizBankDeps {
  feishuClient: FeishuApiClient;
  appToken: string;
  tableId: string;
}

const ANSWER_MAP: Record<string, string> = { A: "a", B: "b", C: "c", D: "d" };

export async function fetchQuizByPeriod(
  deps: QuizBankDeps,
  periodNumber: number,
): Promise<QuizCardState | null> {
  const records = await deps.feishuClient.searchBaseRecords({
    appToken: deps.appToken,
    tableId: deps.tableId,
    fieldName: "期数",
    fieldValue: String(periodNumber),
  });

  if (records.length === 0) return null;

  const questions: QuizQuestion[] = records.map((record) => {
    const f = record.fields ?? {};
    const correctLetter = extractText(f["正确答案"]);
    const correctId = ANSWER_MAP[correctLetter.toUpperCase()] ?? "a";

    const options = (["A", "B", "C", "D"] as const)
      .map((letter) => {
        const text = extractText(f[`选项${letter}`]);
        if (!text) return null;
        return {
          id: letter.toLowerCase(),
          text: `${letter}. ${text}`,
          isCorrect: letter.toLowerCase() === correctId,
        };
      })
      .filter((o): o is NonNullable<typeof o> => o !== null);

    return {
      id: record.recordId,
      text: extractText(f["题目"]),
      options,
    };
  });

  return {
    setCode: `period-${periodNumber}`,
    periodNumber,
    title: `第 ${periodNumber} 期测验`,
    questions,
  };
}

function extractText(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number") return String(value);
  if (Array.isArray(value)) {
    return value
      .map((v) => (typeof v === "object" && v?.text ? v.text : String(v ?? "")))
      .join("")
      .trim();
  }
  if (typeof value === "object" && value !== null && "text" in value) {
    return String((value as { text: unknown }).text ?? "").trim();
  }
  return "";
}
