CREATE TABLE "conversation_sandboxes" (
	"conversation_id" uuid PRIMARY KEY,
	"sandbox_id" text,
	"snapshot_id" text,
	"lock_token" uuid,
	"lock_expires_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "conversation_sandboxes" ADD CONSTRAINT "conversation_sandboxes_conversation_id_conversations_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE;