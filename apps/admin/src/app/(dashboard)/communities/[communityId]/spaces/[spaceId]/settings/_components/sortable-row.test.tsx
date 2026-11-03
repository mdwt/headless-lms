import { describe, expect, it, vi } from "vitest";
import { renderToString } from "react-dom/server";

vi.mock("@/lib/utils", () => ({
  cn: (...inputs: unknown[]) => inputs.filter(Boolean).join(" "),
}));

const { SortableList, SortableRow } = await import("./sortable-row");

function render() {
  const items = ["a", "b"];
  return renderToString(
    <SortableList items={items} idOf={(item) => item} onReorder={() => {}}>
      {items.map((item) => (
        <SortableRow key={item} id={item} label={item}>
          {item}
        </SortableRow>
      ))}
    </SortableList>,
  );
}

describe("SortableList", () => {
  it("renders the same accessibility ids on every render, so the server markup hydrates", () => {
    const first = render();
    expect(first).toContain("aria-describedby=");
    expect(render()).toBe(first);
  });
});
