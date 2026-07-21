import { runSeedDevStudent } from "@headless-lms/server";

await runSeedDevStudent(process.env.DATABASE_URL ?? "");
console.log("Dev student seed complete.");
