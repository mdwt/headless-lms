import { describe, expect, it } from "vitest";

import {
  countByState,
  dashboardHref,
  filterCourses,
  parseDashboardParams,
  pickHero,
  sortCourses,
  toCourseView,
  type CourseView,
} from "./dashboard";
import type { Completion, CourseSummaryVM } from "./types";

function course(id: string, title: string, lessonCount: number): CourseSummaryVM {
  return { id, title, description: "", category: "General", tone: "indigo", lessonCount };
}

function view(id: string, state: CourseView["state"], percent: number, title = id): CourseView {
  return { course: course(id, title, 10), percent, done: 0, state };
}

describe("parseDashboardParams", () => {
  it("defaults every knob when absent", () => {
    expect(parseDashboardParams({})).toEqual({ filter: "all", sort: "recent", layout: "grid" });
  });

  it("reads valid values", () => {
    expect(parseDashboardParams({ filter: "completed", sort: "title", layout: "list" })).toEqual({
      filter: "completed",
      sort: "title",
      layout: "list",
    });
  });

  it("falls back on unknown values rather than trusting the URL", () => {
    expect(parseDashboardParams({ filter: "bogus", sort: "", layout: "table" })).toEqual({
      filter: "all",
      sort: "recent",
      layout: "grid",
    });
  });

  it("takes the first entry of a repeated param", () => {
    expect(parseDashboardParams({ filter: ["completed", "all"] }).filter).toBe("completed");
  });
});

describe("dashboardHref", () => {
  it("is bare when everything is default", () => {
    expect(dashboardHref({ filter: "all", sort: "recent", layout: "grid" })).toBe("/");
  });

  it("only carries non-default knobs", () => {
    expect(dashboardHref({ filter: "completed", sort: "recent", layout: "list" })).toBe(
      "/?filter=completed&layout=list",
    );
  });
});

describe("toCourseView", () => {
  it("counts in-progress lessons as half", () => {
    const completion: Completion = { a: "completed", b: "completed", c: "in-progress" };
    const v = toCourseView(course("c1", "Course", 10), completion);
    expect(v.percent).toBe(25);
    expect(v.done).toBe(2);
    expect(v.state).toBe("in-progress");
  });

  it("is not-started with no reported lessons", () => {
    const v = toCourseView(course("c1", "Course", 4), {});
    expect(v).toMatchObject({ percent: 0, done: 0, state: "not-started" });
  });

  it("is completed once every lesson is done", () => {
    const v = toCourseView(course("c1", "Course", 2), { a: "completed", b: "completed" });
    expect(v).toMatchObject({ percent: 100, state: "completed" });
  });

  it("stays at 0 percent for a course with no lessons", () => {
    expect(toCourseView(course("c1", "Course", 0), {}).percent).toBe(0);
  });
});

describe("filterCourses", () => {
  const views = [
    view("a", "in-progress", 40),
    view("b", "completed", 100),
    view("c", "not-started", 0),
  ];

  it("passes everything through on all", () => {
    expect(filterCourses(views, "all")).toHaveLength(3);
  });

  it("narrows to in-progress", () => {
    expect(filterCourses(views, "inprogress").map((v) => v.course.id)).toEqual(["a"]);
  });

  it("narrows to completed", () => {
    expect(filterCourses(views, "completed").map((v) => v.course.id)).toEqual(["b"]);
  });
});

describe("sortCourses", () => {
  const views = [view("a", "in-progress", 40, "Zebra"), view("b", "completed", 100, "Alpha")];

  it("keeps source order for recent", () => {
    expect(sortCourses(views, "recent").map((v) => v.course.id)).toEqual(["a", "b"]);
  });

  it("orders by descending progress", () => {
    expect(sortCourses(views, "progress").map((v) => v.course.id)).toEqual(["b", "a"]);
  });

  it("orders by title", () => {
    expect(sortCourses(views, "title").map((v) => v.course.title)).toEqual(["Alpha", "Zebra"]);
  });

  it("does not mutate its input", () => {
    const input = [...views];
    sortCourses(input, "progress");
    expect(input.map((v) => v.course.id)).toEqual(["a", "b"]);
  });
});

describe("countByState", () => {
  it("tallies the two stat chips", () => {
    const views = [
      view("a", "in-progress", 40),
      view("b", "in-progress", 10),
      view("c", "completed", 100),
      view("d", "not-started", 0),
    ];
    expect(countByState(views)).toEqual({ inProgress: 2, completed: 1 });
  });
});

describe("pickHero", () => {
  it("takes the first in-progress course", () => {
    const views = [
      view("a", "not-started", 0),
      view("b", "in-progress", 40),
      view("c", "in-progress", 80),
    ];
    expect(pickHero(views)?.course.id).toBe("b");
  });

  it("is undefined when nothing is under way", () => {
    expect(pickHero([view("a", "not-started", 0)])).toBeUndefined();
  });
});
