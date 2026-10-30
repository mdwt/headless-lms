import { codeToHtml, createCssVariablesTheme, type BundledLanguage } from "shiki";
import { CopyButton } from "@/components/copy-button";
import { cn } from "@/lib/utils";

const theme = createCssVariablesTheme({ name: "site", variablePrefix: "--shiki-" });

type CodeProps = {
  code: string;
  language?: BundledLanguage;
  className?: string;
};

export async function Code({ code, language = "bash", className }: CodeProps) {
  const html = await codeToHtml(code, { lang: language, theme });

  return (
    <div
      className={cn(
        "landing-code overflow-x-auto font-mono text-[12.75px] leading-[1.7]",
        className,
      )}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

export async function CodeBlock({
  code,
  language = "bash",
  filename,
  className,
}: CodeProps & { filename?: string }) {
  return (
    <div
      className={cn(
        "group/code overflow-hidden rounded-[12px] bg-raised text-left shadow-card ring-1 ring-line",
        className,
      )}
    >
      <div className="flex h-10 items-center justify-between border-b border-line bg-surface-2 pr-1.5 pl-4 font-mono text-[11.5px] text-subtle">
        <span>{filename ?? language}</span>
        <CopyButton code={code} />
      </div>
      <Code code={code} language={language} className="px-5 pt-4 pb-5" />
    </div>
  );
}
