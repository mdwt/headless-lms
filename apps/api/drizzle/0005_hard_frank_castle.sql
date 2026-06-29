ALTER TABLE "enrollments" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "offers" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "billing" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "enrollments" CASCADE;--> statement-breakpoint
DROP TABLE "offers" CASCADE;--> statement-breakpoint
DROP TABLE "billing" CASCADE;--> statement-breakpoint
ALTER TABLE "entitlements" ADD COLUMN "student_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "entitlements" ADD COLUMN "course_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "entitlements" ADD COLUMN "status" text DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE "entitlements" ADD COLUMN "source" text DEFAULT 'manual' NOT NULL;--> statement-breakpoint
ALTER TABLE "entitlements" ADD COLUMN "progress_percent" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "entitlements" ADD COLUMN "granted_at" timestamp DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "entitlements" ADD COLUMN "expires_at" timestamp;--> statement-breakpoint
ALTER TABLE "entitlements" ADD CONSTRAINT "entitlements_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entitlements" ADD CONSTRAINT "entitlements_org_id_course_id_courses_org_id_id_fk" FOREIGN KEY ("org_id","course_id") REFERENCES "public"."courses"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entitlements" ADD CONSTRAINT "entitlements_org_id_student_id_course_id_unique" UNIQUE("org_id","student_id","course_id");