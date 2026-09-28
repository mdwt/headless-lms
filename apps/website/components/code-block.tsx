import { codeToHtml, createCssVariablesTheme, type BundledLanguage } from "shiki";
import { CopyButton } from "@/components/copy-button";
import { cn } from "@/lib/utils";

const theme = createCssVariablesTheme({ name: "site", variablePrefix: "--shiki-" });

type CodeBlockProps = {
  code: string;
  language?: BundledLanguage;
  filename?: string;
  className?: string;
};

export async function CodeBlock({ code, language = "bash", filename, className }: CodeBlockProps) {
  const html = await codeToHtml(code, { lang: language, theme });

  return (
    <div
      className={cn(
        "group/code overflow-hidden rounded-2xl border border-border bg-card text-left",
        className,
      )}
    >
      <div className="flex items-center justify-between border-b border-border/70 bg-secondary/40 px-4 py-2.5 font-mono text-xs text-muted-foreground">
        <span>{filename ?? language}</span>
        <CopyButton code={code} />
      </div>
      <div
        className="landing-code overflow-x-auto p-4 font-mono text-sm/6"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  );
}
