// modules — in-memory repository. Modules are built per course on first access
// and mutated in place for the session.
import { randomUUID } from "node:crypto";
import type { ModulesRepository } from "../../core/modules/ports.js";
import type {
  Assessment,
  Lesson,
  LessonType,
  Module,
  ModuleItem,
  SaveItemInput,
} from "../../core/modules/model.js";

const LESSON_TYPES: LessonType[] = ["video", "text", "pdf", "audio", "download", "embed"];
const LESSON_TITLES = [
  "Introduction & setup",
  "Core principles",
  "Working through an example",
  "Common pitfalls",
  "Hands-on exercise",
  "Going further",
];
const MODULE_TITLES = ["Getting started", "Fundamentals", "In practice", "Advanced", "Capstone"];

function buildModules(courseId: string): Module[] {
  const seed = [...courseId].reduce((a, c) => a + c.charCodeAt(0), 0);
  const moduleCount = 3 + (seed % 3);
  return Array.from({ length: moduleCount }, (_, m): Module => {
    const moduleId = `mod_${courseId}_${m}`;
    const itemCount = 3 + ((seed + m) % 3);
    const items = Array.from({ length: itemCount }, (_, n): ModuleItem => {
      const isAssessment = (seed + m + n) % 4 === 3;
      if (isAssessment) {
        const isAssignment = (seed + n) % 2 === 0;
        const item: Assessment = {
          id: `itm_${courseId}_${m}_${n}`,
          moduleId,
          kind: "assessment",
          title: isAssignment ? `Assignment ${m + 1}.${n + 1}` : `Quiz ${m + 1}.${n + 1}`,
          order: n,
          type: isAssignment ? "assignment" : "quiz",
          published: (seed + m + n) % 6 !== 0,
        };
        if (!isAssignment) item.questionCount = 5 + (n % 6);
        item.pointsPossible = isAssignment ? 100 : 50;
        return item;
      }
      const type = LESSON_TYPES[(seed + m + n) % LESSON_TYPES.length] as LessonType;
      const mins = 4 + ((seed + n * 3) % 22);
      const item: Lesson = {
        id: `itm_${courseId}_${m}_${n}`,
        moduleId,
        kind: "lesson",
        title: LESSON_TITLES[(m + n) % LESSON_TITLES.length] as string,
        order: n,
        type,
        published: (seed + m + n) % 7 !== 0,
      };
      if (type !== "download" && type !== "embed") item.durationLabel = `${mins} min`;
      return item;
    });
    return {
      id: moduleId,
      courseId,
      title: MODULE_TITLES[m % MODULE_TITLES.length] as string,
      order: m,
      items,
    };
  });
}

export class InMemoryModulesRepository implements ModulesRepository {
  private store = new Map<string, Module[]>();

  private modules(courseId: string): Module[] {
    let mods = this.store.get(courseId);
    if (!mods) {
      mods = buildModules(courseId);
      this.store.set(courseId, mods);
    }
    return mods;
  }

  private clone(courseId: string): Module[] {
    return this.modules(courseId).map((m) => ({ ...m, items: [...m.items] }));
  }

  async listForCourse(courseId: string): Promise<Module[]> {
    return this.clone(courseId);
  }

  async reorderModules(courseId: string, orderedIds: string[]): Promise<Module[]> {
    const mods = this.modules(courseId);
    mods.sort((a, b) => orderedIds.indexOf(a.id) - orderedIds.indexOf(b.id));
    mods.forEach((m, i) => (m.order = i));
    return this.clone(courseId);
  }

  async createModule(courseId: string, title: string): Promise<Module[]> {
    const mods = this.modules(courseId);
    mods.push({ id: `mod_${randomUUID().slice(0, 8)}`, courseId, title, order: mods.length, items: [] });
    return this.clone(courseId);
  }

  async updateModule(courseId: string, moduleId: string, title: string): Promise<Module[]> {
    const mod = this.modules(courseId).find((m) => m.id === moduleId);
    if (mod) mod.title = title;
    return this.clone(courseId);
  }

  async deleteModule(courseId: string, moduleId: string): Promise<Module[]> {
    this.store.set(courseId, this.modules(courseId).filter((m) => m.id !== moduleId));
    return this.clone(courseId);
  }

  async reorderItems(courseId: string, moduleId: string, orderedIds: string[]): Promise<Module[]> {
    const mod = this.modules(courseId).find((m) => m.id === moduleId);
    if (mod) {
      mod.items.sort((a, b) => orderedIds.indexOf(a.id) - orderedIds.indexOf(b.id));
      mod.items.forEach((it, i) => (it.order = i));
    }
    return this.clone(courseId);
  }

  async saveItem(
    courseId: string,
    moduleId: string,
    input: SaveItemInput,
    itemId?: string,
  ): Promise<Module[]> {
    const mod = this.modules(courseId).find((m) => m.id === moduleId);
    if (!mod) return this.clone(courseId);

    if (itemId) {
      const idx = mod.items.findIndex((it) => it.id === itemId);
      if (idx !== -1) {
        const existing = mod.items[idx] as ModuleItem;
        mod.items[idx] = { ...existing, ...input, id: existing.id, moduleId, order: existing.order } as ModuleItem;
      }
    } else {
      const order = mod.items.length;
      const id = `itm_${randomUUID().slice(0, 8)}`;
      const created: ModuleItem =
        input.kind === "assessment"
          ? { id, moduleId, order, published: input.published ?? false, ...input }
          : { id, moduleId, order, published: input.published ?? false, ...input };
      mod.items.push(created);
    }
    return this.clone(courseId);
  }

  async deleteItem(courseId: string, moduleId: string, itemId: string): Promise<Module[]> {
    const mod = this.modules(courseId).find((m) => m.id === moduleId);
    if (mod) mod.items = mod.items.filter((it) => it.id !== itemId);
    return this.clone(courseId);
  }
}
