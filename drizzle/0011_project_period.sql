ALTER TABLE "projects" ADD COLUMN "planned_start" date;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "planned_end" date;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "description" text;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_planned_period_check" CHECK ((planned_start is null) = (planned_end is null)
          and (planned_end is null or planned_end >= planned_start));--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_description_check" CHECK (description ~ '\S' and char_length(description) <= 500);