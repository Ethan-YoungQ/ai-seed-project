const CATEGORY_LABELS: Record<string, string> = {
  daily_participation: "日常参与",
  ai_artifact: "AI 作品/产物",
  ai_practice_reflection: "AI 实践复盘",
  prompt_or_method: "Prompt/方法分享",
  resource_recommendation: "资源推荐",
  peer_help: "互助答疑",
  formal_task: "正式任务",
  operator_adjustment: "运营调分",
};

export function formatReviewQueueItemCode(code: string): string {
  return CATEGORY_LABELS[code] ?? code;
}

export function formatReviewQueueReason(reason: string | null | undefined): string {
  const text = reason?.trim();
  if (!text) return "需要运营人工复核";
  if (/LLM returned invalid scoring output/i.test(text)) {
    return "模型返回格式异常，需要运营人工复核";
  }
  if (/LLM scoring failed/i.test(text)) {
    return "模型评分失败，需要运营人工复核";
  }
  if (/duplicate_content/i.test(text)) {
    return "疑似重复内容，需要运营确认是否计分";
  }
  return text;
}

export function formatReviewQueueExcerpt(input: {
  evidence: string | null | undefined;
  reason: string | null | undefined;
}): string {
  const evidence = input.evidence?.trim();
  if (
    evidence &&
    !/^Invalid response from .+ while scoring content hash/i.test(evidence)
  ) {
    return evidence;
  }
  return "原消息已记录，但模型未能完成结构化评分；请结合群内上下文判断是否给分。";
}
