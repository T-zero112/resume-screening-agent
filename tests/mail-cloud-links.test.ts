import { describe, expect, it } from "vitest";

import { findCloudAttachmentLinks } from "../src/mail/email-inbox.js";

describe("findCloudAttachmentLinks", () => {
  it("detects and deduplicates URLs from a cloud-attachment message", () => {
    const links = findCloudAttachmentLinks("请下载云附件：https://example.com/download?id=1。 https://example.com/download?id=1");
    expect(links).toEqual(["https://example.com/download?id=1"]);
  });

  it("detects known cloud-drive hosts even without attachment keywords", () => {
    expect(findCloudAttachmentLinks("https://pan.baidu.com/s/abc123")).toEqual(["https://pan.baidu.com/s/abc123"]);
  });

  it("does not report ordinary links without cloud-attachment context", () => {
    expect(findCloudAttachmentLinks("公司介绍：https://example.com/about")).toEqual([]);
  });

  it("does not classify a cloud-attachment notice with no URL as a downloadable link", () => {
    expect(findCloudAttachmentLinks("请登录云附件页面下载文件")).toEqual([]);
  });
});
