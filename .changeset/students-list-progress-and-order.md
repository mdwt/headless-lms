---
"@headless-lms/adapter-db": patch
---

The students list returns each student's real average progress: the mean, over the courses they can open, of the share of published activities they completed, the same figure as the student's own analytics. It was always 0, and sorting by it did nothing. Sorting by last active puts students who were never active after the active ones, in either direction.
