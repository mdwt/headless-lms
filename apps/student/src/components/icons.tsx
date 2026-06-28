// Lesson-type icon mapping (handoff: Lucide maps ~1:1 to the prototype's set).
import {
  Play,
  FileText,
  ListChecks,
  FileType,
  AudioLines,
  Download,
  type LucideIcon,
} from "lucide-react";
import type { LessonType } from "@/lib/types";

export const LESSON_ICON: Record<LessonType, LucideIcon> = {
  video: Play,
  text: FileText,
  quiz: ListChecks,
  pdf: FileType,
  audio: AudioLines,
  download: Download,
};

export const LESSON_TYPE_LABEL: Record<LessonType, string> = {
  video: "Video",
  text: "Reading",
  quiz: "Quiz",
  pdf: "PDF",
  audio: "Audio",
  download: "Download",
};
