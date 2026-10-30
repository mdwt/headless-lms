import defaultMdxComponents from "fumadocs-ui/mdx";
import { Step, Steps } from "fumadocs-ui/components/steps";
import { Tab, Tabs } from "fumadocs-ui/components/tabs";
import type { MDXComponents } from "mdx/types";
import { ScopeMatrix } from "@/components/mcp/scope-matrix";
import { ToolCatalogue } from "@/components/mcp/tool-catalogue";

export function getMDXComponents(components?: MDXComponents) {
  return {
    ...defaultMdxComponents,
    Step,
    Steps,
    Tab,
    Tabs,
    ScopeMatrix,
    ToolCatalogue,
    ...components,
  } satisfies MDXComponents;
}
