import { describe, expect, it } from "vitest";
import { MarkdownBodyParser } from "./index.js";

const parser = new MarkdownBodyParser();

describe("MarkdownBodyParser", () => {
  it("reads the text without the markup and keeps mention tokens", () => {
    const parsed = parser.parse(
      "## Welcome\n\nHi <@ou_sarah>, this is **bold** and _soft_ with a [link](https://example.com).\n\n- one\n- two\n\n> quoted",
    );
    expect(parsed.text).toBe(
      "Welcome\nHi <@ou_sarah>, this is bold and soft with a link.\none\ntwo\nquoted",
    );
    expect(parsed.mentions).toEqual(["ou_sarah"]);
  });

  it("lists each asset image once, in order, and leaves images out of the text", () => {
    const parsed = parser.parse(
      "Before\n\n![a cat](asset:ast_1)\n\n![](https://example.com/x.png)\n\n![again](asset:ast_2) ![](asset:ast_1)",
    );
    expect(parsed.assetIds).toEqual(["ast_1", "ast_2"]);
    expect(parsed.text).toBe("Before");
  });

  it("lists files linked as assets with the images, and reads a file's name as text", () => {
    const parsed = parser.parse(
      "See ![](asset:ast_1)\n\n[notes.pdf](asset:ast_2) and [site](https://example.com)",
    );
    expect(parsed.assetIds).toEqual(["ast_1", "ast_2"]);
    expect(parsed.text).toBe("See\nnotes.pdf and site");
  });

  it("ignores mentions written as code", () => {
    const parsed = parser.parse(
      "Use `<@ou_james>` to mention.\n\n```\n<@ou_emma>\n```\n\nThanks <@ou_sarah>",
    );
    expect(parsed.mentions).toEqual(["ou_sarah"]);
    expect(parsed.text).toBe("Use <@ou_james> to mention.\n<@ou_emma>\nThanks <@ou_sarah>");
  });

  it("drops raw HTML", () => {
    const parsed = parser.parse("<div>hidden</div>\n\nshown <b>bold</b>");
    expect(parsed.text).toBe("shown bold");
  });

  it("reads a table row by row", () => {
    const parsed = parser.parse("| a | b |\n| - | - |\n| 1 | 2 |");
    expect(parsed.text).toBe("a b\n1 2");
  });

  it("reads plain text as itself", () => {
    expect(parser.parse("Just words")).toEqual({ text: "Just words", mentions: [], assetIds: [] });
  });
});
