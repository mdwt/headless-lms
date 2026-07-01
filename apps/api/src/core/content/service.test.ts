import { describe, it, expect, vi } from "vitest";
import { ContentServiceImpl } from "./service.js";
import type { ContentRepository, ContentStructureRepository } from "./ports.js";
import type { Course, Module } from "./model.js";

function makeCourse(over: Partial<Course> = {}): Course {
  return {
    id: "c1",
    title: "Intro",
    slug: "intro",
    description: "",
    status: "draft",
    category: "",
    moduleCount: 0,
    activityCount: 0,
    enrolledCount: 0,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...over,
  };
}

function makeRepo(): ContentRepository {
  return {
    list: vi.fn(),
    findById: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  };
}

function makeStructureRepo(): ContentStructureRepository {
  return {
    listForCourse: vi.fn(),
    reorderModules: vi.fn(),
    createModule: vi.fn(),
    updateModule: vi.fn(),
    deleteModule: vi.fn(),
    reorderActivities: vi.fn(),
    saveActivity: vi.fn(),
    deleteActivity: vi.fn(),
  };
}

describe("ContentServiceImpl", () => {
  it("derives the slug from the title on create", async () => {
    const repo = makeRepo();
    const created = makeCourse({ title: "My New Course", slug: "my-new-course" });
    (repo.create as ReturnType<typeof vi.fn>).mockResolvedValue(created);

    const svc = new ContentServiceImpl(repo, makeStructureRepo());
    const result = await svc.create("org1", { title: "My New Course" });

    expect(repo.create).toHaveBeenCalledWith("org1", { title: "My New Course" }, "my-new-course");
    expect(result).toBe(created);
  });

  it("delegates course reads to the content repository", async () => {
    const repo = makeRepo();
    const course = makeCourse();
    (repo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(course);

    const svc = new ContentServiceImpl(repo, makeStructureRepo());
    const result = await svc.get("org1", "c1");

    expect(repo.findById).toHaveBeenCalledWith("org1", "c1");
    expect(result).toBe(course);
  });

  it("delegates structure writes to the structure repository", async () => {
    const structure = makeStructureRepo();
    const modules: Module[] = [
      { id: "m1", courseId: "c1", title: "Module 1", seq: 0, activities: [] },
    ];
    (structure.saveActivity as ReturnType<typeof vi.fn>).mockResolvedValue(modules);

    const svc = new ContentServiceImpl(makeRepo(), structure);
    const result = await svc.saveActivity("org1", "c1", "m1", { settings: { title: "A" } });

    expect(structure.saveActivity).toHaveBeenCalledWith(
      "org1",
      "c1",
      "m1",
      { settings: { title: "A" } },
      undefined,
    );
    expect(result).toBe(modules);
  });

  it("passes an activity id through on update", async () => {
    const structure = makeStructureRepo();
    (structure.saveActivity as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    const svc = new ContentServiceImpl(makeRepo(), structure);
    await svc.saveActivity("org1", "c1", "m1", { assetIds: ["a1"] }, "act1");

    expect(structure.saveActivity).toHaveBeenCalledWith(
      "org1",
      "c1",
      "m1",
      { assetIds: ["a1"] },
      "act1",
    );
  });
});
