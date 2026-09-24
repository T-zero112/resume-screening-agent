import OpenAI from "openai";

import { resolveLlmConfig } from "../extraction/llm-config.js";
import { withLlmTrace } from "../observability/langsmith.js";

export type PdfVisionOcrInput = {
  imageDataUrl: string;
  pageNumber: number;
  documentName: string;
  signal?: AbortSignal;
};

export type PdfVisionOcrResult = {
  text: string;
  provider: string;
  baseURL?: string;
  model: string;
};

export async function transcribePdfPageWithVision(input: PdfVisionOcrInput): Promise<PdfVisionOcrResult> {
  const model = process.env.PDF_VISION_OCR_MODEL ?? process.env.OCR_MODEL ?? process.env.LLM_MODEL;
  const llmConfig = resolveLlmConfig(model);
  const client = new OpenAI({ apiKey: llmConfig.apiKey, baseURL: llmConfig.baseURL });

  const response = await withLlmTrace({
    operation: "pdf_vision_ocr",
    provider: llmConfig.provider,
    model: llmConfig.model,
    baseURL: llmConfig.baseURL,
  }, () => client.responses.create(
    {
      model: llmConfig.model,
      input: [
        {
          role: "system",
          content: [
            {
              type: "input_text",
              text: [
                "你是招聘简历 PDF 的 OCR 模块。",
                "请只转写图片中真实可见的简历文字，不要补充、推断或评价候选人。",
                "保持自然阅读顺序，保留姓名、联系方式、教育、工作经历、项目经历、证书、求职意向等信息。",
                "如果页面没有可读文字，输出空字符串。",
              ].join("\n"),
            },
          ],
        },
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: `请转写 ${input.documentName} 第 ${input.pageNumber} 页的简历文字。`,
            },
            {
              type: "input_image",
              image_url: input.imageDataUrl,
              detail: "high",
            },
          ],
        },
      ],
    },
    { signal: input.signal },
  ));

  return {
    text: response.output_text.trim(),
    provider: llmConfig.provider,
    baseURL: llmConfig.baseURL,
    model: llmConfig.model,
  };
}
