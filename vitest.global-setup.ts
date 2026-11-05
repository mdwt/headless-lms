import { runMigrations } from "@headless-lms/adapter-db";

export default async function setup(): Promise<void> {
  const url = process.env.TEST_DATABASE_URL;
  if (url) {
    await runMigrations(url);
  }
}
