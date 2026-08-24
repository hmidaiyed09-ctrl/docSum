"use client";

import { useEffect, useState } from "react";
import hljs from "highlight.js/lib/common";
import "highlight.js/styles/github-dark.css";

export default function CodeBlock({ code, language }: { code: string; language?: string }) {
  const [html, setHtml] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    try {
      const lang = language && hljs.getLanguage(language) ? language : undefined;
      const result = lang
        ? hljs.highlight(code, { language: lang })
        : hljs.highlightAuto(code);
      setHtml(result.value);
    } catch {
      setHtml(code.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"));
    }
  }, [code, language]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable */
    }
  };

  return (
    <div className="w-full overflow-hidden rounded-xl border border-white/10 bg-[#0d1117]">
      <div className="flex items-center justify-between border-b border-white/10 bg-white/5 px-4 py-2">
        <span className="text-xs font-medium uppercase tracking-wide text-slate-400">
          {language || "code"}
        </span>
        <button
          onClick={copy}
          className="rounded-md px-2.5 py-1 text-xs text-slate-300 transition hover:bg-white/10 hover:text-white"
        >
          {copied ? "✓ Copied" : "Copy"}
        </button>
      </div>
      <pre className="max-h-[60vh] overflow-auto p-4 text-[15px] leading-relaxed">
        <code className="hljs" dangerouslySetInnerHTML={{ __html: html }} />
      </pre>
    </div>
  );
}
