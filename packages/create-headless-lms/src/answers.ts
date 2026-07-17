export type DbAnswer = { mode: "docker" } | { mode: "url"; url: string };
export type StorageAnswer =
  | { mode: "minio" }
  | {
      mode: "s3";
      endPoint: string;
      port: number;
      useSSL: boolean;
      accessKey: string;
      secretKey: string;
      region: string;
      bucket: string;
    }
  | { mode: "skip" };

export interface Answers {
  name: string;
  db: DbAnswer;
  storage: StorageAnswer;
  port: number;
  clientOrigins: string;
}

export function defaultAnswers(name: string): Answers {
  return {
    name,
    db: { mode: "docker" },
    storage: { mode: "minio" },
    port: 8000,
    clientOrigins: "http://localhost:8001,http://localhost:8002",
  };
}

/** my-lms → my_lms: the docker Postgres database name. */
export function dbName(name: string): string {
  return name.replace(/[^a-zA-Z0-9]+/g, "_").toLowerCase();
}
