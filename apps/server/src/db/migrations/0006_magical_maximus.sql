CREATE TYPE "public"."feedback_status" AS ENUM('pending', 'processing', 'resolved', 'closed');--> statement-breakpoint
CREATE TABLE "api_channels" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" varchar(50) NOT NULL,
	"name" varchar(100),
	"api_key_encrypted" text NOT NULL,
	"base_url" varchar(500),
	"priority" integer DEFAULT 0,
	"max_concurrency" integer DEFAULT 10,
	"weight" integer DEFAULT 1,
	"status" varchar(20) DEFAULT 'active',
	"daily_limit" bigint DEFAULT 5000000,
	"daily_used" bigint DEFAULT 0,
	"daily_reset_at" timestamp,
	"user_tier" varchar(20) DEFAULT 'all',
	"last_error_at" timestamp,
	"last_error_message" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chapter_analysis" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"chapter_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"type" varchar(50) NOT NULL,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"job_id" varchar(255),
	"result" text,
	"progress" integer DEFAULT 0,
	"error_message" text,
	"dismissed" boolean DEFAULT false NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "content_fingerprints" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"template_id" uuid NOT NULL,
	"fingerprint_hash" varchar(64) NOT NULL,
	"fingerprint_dec" bigint NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "content_fingerprints_template_id_unique" UNIQUE("template_id")
);
--> statement-breakpoint
CREATE TABLE "edit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"entity_type" varchar(20) NOT NULL,
	"entity_id" uuid NOT NULL,
	"field_name" varchar(50) NOT NULL,
	"old_value" text,
	"new_value" text,
	"edit_reason" text,
	"ai_role" varchar(50),
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "feedbacks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"type" varchar(20) DEFAULT 'feedback' NOT NULL,
	"title" varchar(200) NOT NULL,
	"content" text NOT NULL,
	"screenshot" text,
	"status" "feedback_status" DEFAULT 'pending' NOT NULL,
	"admin_reply" text,
	"replied_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "model_pricing" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" varchar(50) NOT NULL,
	"model_id" varchar(100) NOT NULL,
	"model_name" varchar(200) NOT NULL,
	"group_name" varchar(50) DEFAULT 'default',
	"input_price_per_1m" bigint NOT NULL,
	"output_price_per_1m" bigint NOT NULL,
	"currency" varchar(10) DEFAULT 'CNY',
	"is_active" boolean DEFAULT true,
	"sort_order" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"title" varchar(200) NOT NULL,
	"content" text NOT NULL,
	"is_read" boolean DEFAULT false NOT NULL,
	"feedback_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "password_reset_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token" varchar(64) NOT NULL,
	"expires_at" timestamp NOT NULL,
	"used_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "password_reset_tokens_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "setting_relationships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"source_id" uuid NOT NULL,
	"target_id" uuid NOT NULL,
	"relation_type" varchar(30) NOT NULL,
	"description" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "settings_deliveries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"title" text NOT NULL,
	"content" jsonb NOT NULL,
	"conversation_id" uuid,
	"created_by" uuid,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "story_narratives" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"title" text NOT NULL,
	"content" text NOT NULL,
	"status" varchar(20) DEFAULT 'active',
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "token_consumption_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"source" varchar(20) NOT NULL,
	"api_key_id" uuid,
	"provider" varchar(50) NOT NULL,
	"model_id" varchar(100) NOT NULL,
	"request_type" varchar(50),
	"input_tokens" bigint DEFAULT 0,
	"output_tokens" bigint DEFAULT 0,
	"cache_hit_tokens" bigint DEFAULT 0,
	"cost" bigint NOT NULL,
	"request_id" varchar(200),
	"project_id" uuid,
	"conversation_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "token_packages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(100) NOT NULL,
	"type" varchar(20) NOT NULL,
	"price_cents" integer NOT NULL,
	"duration_days" integer,
	"token_quota" bigint NOT NULL,
	"model_group" varchar(50) NOT NULL,
	"features" jsonb DEFAULT '{}'::jsonb,
	"is_active" boolean DEFAULT true,
	"first_purchase_price" integer,
	"sort_order" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "token_recharge_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"package_id" uuid,
	"amount_cents" integer NOT NULL,
	"token_amount" bigint NOT NULL,
	"payment_method" varchar(30),
	"payment_trade_no" varchar(100),
	"status" varchar(20) DEFAULT 'pending',
	"paid_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_api_keys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" varchar(100) NOT NULL,
	"key_hash" varchar(64) NOT NULL,
	"key_prefix" varchar(12) NOT NULL,
	"status" varchar(20) DEFAULT 'active',
	"last_used_at" timestamp,
	"expires_at" timestamp,
	"ip_whitelist" text[],
	"rate_limit_per_min" integer DEFAULT 60,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_api_keys_key_hash_unique" UNIQUE("key_hash")
);
--> statement-breakpoint
CREATE TABLE "user_subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"package_id" uuid,
	"status" varchar(20) NOT NULL,
	"started_at" timestamp NOT NULL,
	"expires_at" timestamp,
	"token_quota_total" bigint NOT NULL,
	"token_quota_used" bigint DEFAULT 0,
	"auto_renew" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_token_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"balance" bigint DEFAULT 0,
	"total_consumed" bigint DEFAULT 0,
	"total_recharged" bigint DEFAULT 0,
	"alert_threshold" bigint,
	"alert_enabled" boolean DEFAULT false,
	"preferred_model" varchar(100),
	"daily_limit" bigint DEFAULT 10000,
	"daily_used" bigint DEFAULT 0,
	"daily_reset_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_token_accounts_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
ALTER TABLE "projects" ALTER COLUMN "genre_tag" SET DATA TYPE varchar(100);--> statement-breakpoint
ALTER TABLE "ai_configs" ADD COLUMN "is_default" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "model_id" varchar(100);--> statement-breakpoint
ALTER TABLE "genre_presets" ADD COLUMN "project_type" varchar(20) DEFAULT 'webnovel';--> statement-breakpoint
ALTER TABLE "memory_entries" ADD COLUMN "update_count" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "writing_style" jsonb DEFAULT '{}'::jsonb;--> statement-breakpoint
ALTER TABLE "templates" ADD COLUMN "ai_target_role" varchar(50);--> statement-breakpoint
ALTER TABLE "templates" ADD COLUMN "deleted_at" timestamp;--> statement-breakpoint
ALTER TABLE "user_sprites" ADD COLUMN "guide_reward_claimed" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "user_templates" ADD COLUMN "ai_target_role" varchar(50);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "user_role" varchar(20) DEFAULT 'free';--> statement-breakpoint
ALTER TABLE "chapter_analysis" ADD CONSTRAINT "chapter_analysis_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chapter_analysis" ADD CONSTRAINT "chapter_analysis_chapter_id_chapters_id_fk" FOREIGN KEY ("chapter_id") REFERENCES "public"."chapters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chapter_analysis" ADD CONSTRAINT "chapter_analysis_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_fingerprints" ADD CONSTRAINT "content_fingerprints_template_id_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."templates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "edit_logs" ADD CONSTRAINT "edit_logs_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feedbacks" ADD CONSTRAINT "feedbacks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_feedback_id_feedbacks_id_fk" FOREIGN KEY ("feedback_id") REFERENCES "public"."feedbacks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "setting_relationships" ADD CONSTRAINT "setting_relationships_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settings_deliveries" ADD CONSTRAINT "settings_deliveries_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settings_deliveries" ADD CONSTRAINT "settings_deliveries_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settings_deliveries" ADD CONSTRAINT "settings_deliveries_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "story_narratives" ADD CONSTRAINT "story_narratives_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "token_consumption_logs" ADD CONSTRAINT "token_consumption_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "token_recharge_orders" ADD CONSTRAINT "token_recharge_orders_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_api_keys" ADD CONSTRAINT "user_api_keys_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_subscriptions" ADD CONSTRAINT "user_subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_token_accounts" ADD CONSTRAINT "user_token_accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;