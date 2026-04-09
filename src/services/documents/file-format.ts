const MIME_TYPE_EXTENSIONS: Record<string, string> = {
  "application/pdf": "pdf",
  "application/msword": "doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx"
};

function normalizeMimeType(mimeType: string | undefined) {
  return mimeType?.split(";")[0]?.trim().toLowerCase();
}

export function inferDocumentFileExt(input: { fileName?: string; mimeType?: string }) {
  const fileNameExt = input.fileName?.split(".").at(-1)?.trim().toLowerCase();
  const normalizedMimeType = normalizeMimeType(input.mimeType);
  const mimeTypeExt = normalizedMimeType ? MIME_TYPE_EXTENSIONS[normalizedMimeType] : undefined;

  if (mimeTypeExt === "pdf" || mimeTypeExt === "docx") {
    return mimeTypeExt;
  }

  if (fileNameExt) {
    return fileNameExt;
  }

  return mimeTypeExt;
}
