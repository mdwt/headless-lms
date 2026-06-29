CREATE TABLE "module_items" (
	"id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"module_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"order" integer NOT NULL,
	"type" text NOT NULL,
	"duration_label" text,
	"asset_id" uuid,
	"question_count" integer,
	"points_possible" integer,
	"published" boolean DEFAULT false NOT NULL,
	CONSTRAINT "module_items_org_id_id_pk" PRIMARY KEY("org_id","id")
);
--> statement-breakpoint
CREATE TABLE "modules" (
	"id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"course_id" uuid NOT NULL,
	"title" text NOT NULL,
	"order" integer NOT NULL,
	CONSTRAINT "modules_org_id_id_pk" PRIMARY KEY("org_id","id")
);
--> statement-breakpoint
CREATE TABLE "enrollments" (
	"id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"course_id" uuid NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"source" text DEFAULT 'manual' NOT NULL,
	"progress_percent" integer DEFAULT 0 NOT NULL,
	"granted_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp,
	CONSTRAINT "enrollments_org_id_id_pk" PRIMARY KEY("org_id","id"),
	CONSTRAINT "enrollments_org_id_student_id_course_id_unique" UNIQUE("org_id","student_id","course_id")
);
--> statement-breakpoint
ALTER TABLE "courses" ADD COLUMN "title" text NOT NULL;--> statement-breakpoint
ALTER TABLE "courses" ADD COLUMN "slug" text NOT NULL;--> statement-breakpoint
ALTER TABLE "courses" ADD COLUMN "description" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "courses" ADD COLUMN "status" text DEFAULT 'draft' NOT NULL;--> statement-breakpoint
ALTER TABLE "courses" ADD COLUMN "category" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "courses" ADD COLUMN "instructor_id" uuid;--> statement-breakpoint
ALTER TABLE "courses" ADD COLUMN "created_at" timestamp DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "courses" ADD COLUMN "updated_at" timestamp DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "module_items" ADD CONSTRAINT "module_items_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "module_items" ADD CONSTRAINT "module_items_org_id_module_id_modules_org_id_id_fk" FOREIGN KEY ("org_id","module_id") REFERENCES "public"."modules"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "modules" ADD CONSTRAINT "modules_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "modules" ADD CONSTRAINT "modules_org_id_course_id_courses_org_id_id_fk" FOREIGN KEY ("org_id","course_id") REFERENCES "public"."courses"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_org_id_course_id_courses_org_id_id_fk" FOREIGN KEY ("org_id","course_id") REFERENCES "public"."courses"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "courses" ADD CONSTRAINT "courses_instructor_id_students_id_fk" FOREIGN KEY ("instructor_id") REFERENCES "public"."students"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "courses" ADD CONSTRAINT "courses_org_id_slug_unique" UNIQUE("org_id","slug");