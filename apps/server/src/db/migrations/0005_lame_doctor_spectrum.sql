CREATE TYPE "public"."genre" AS ENUM('xianxia', 'urban', 'apocalypse', 'romance', 'military', 'political', 'scifi', 'suspense', 'fantasy', 'historical', 'game', 'male_oriented', 'female_oriented', 'other', 'serious_literature', 'historical_literature', 'children_literature', 'detective_novel', 'social_realism', 'wuxia_novel', 'historical_novel', 'historical_webnovel', 'ancient_romance', 'modern_romance', 'sweet_pet', 'entertainment', 'quick_transmigration', 'xianxia_romance', 'palace_intrigue', 'movie_drama', 'web_drama', 'short_drama', 'family_ethics');--> statement-breakpoint
CREATE TYPE "public"."sprite_ai_task_status" AS ENUM('pending', 'in_progress', 'success', 'failed');--> statement-breakpoint
CREATE TYPE "public"."sprite_ai_task_type" AS ENUM('analyze', 'implement');--> statement-breakpoint
CREATE TYPE "public"."sprite_companion_style" AS ENUM('active', 'quiet');--> statement-breakpoint
CREATE TYPE "public"."sprite_text_status" AS ENUM('draft', 'confirmed', 'published', 'failed');--> statement-breakpoint
CREATE TYPE "public"."sprite_text_type" AS ENUM('user-trigger', 'idle-phase');--> statement-breakpoint
ALTER TYPE "public"."project_type" ADD VALUE 'webnovel' BEFORE 'screenplay';--> statement-breakpoint
CREATE TABLE "admin_audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"admin_id" uuid NOT NULL,
	"admin_level" integer,
	"action" varchar(50) NOT NULL,
	"target_type" varchar(30),
	"target_id" uuid,
	"details" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "art_assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"category" varchar(30) NOT NULL,
	"subcategory" varchar(30),
	"asset_key" varchar(100) NOT NULL,
	"name" varchar(100) NOT NULL,
	"description" text,
	"file_format" varchar(10),
	"width" integer,
	"height" integer,
	"file_size" integer,
	"storage_path" text NOT NULL,
	"cdn_url" text,
	"is_published" boolean DEFAULT false,
	"is_active" boolean DEFAULT true,
	"version" integer DEFAULT 1,
	"replaced_by" uuid,
	"created_by" uuid,
	"updated_by" uuid,
	"published_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "disclaimers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text DEFAULT '模板发布免责声明' NOT NULL,
	"content" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "genre_presets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"genre" "genre" NOT NULL,
	"agent_role" varchar(50) NOT NULL,
	"system_prompt" text NOT NULL,
	"description" text,
	"category" varchar(50),
	"style_prompt" text,
	"sort_order" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "outline_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entity_type" varchar(20) NOT NULL,
	"entity_id" uuid NOT NULL,
	"synopsis" text NOT NULL,
	"version_number" integer DEFAULT 1 NOT NULL,
	"deleted_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recharge_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"amount_cents" integer NOT NULL,
	"bean_amount" integer NOT NULL,
	"payment_method" varchar(20),
	"status" varchar(20) DEFAULT 'pending',
	"transaction_id" varchar(100),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sprite_ai_tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entry_id" uuid NOT NULL,
	"species" varchar(20) NOT NULL,
	"variant" varchar(50) NOT NULL,
	"level" integer NOT NULL,
	"task_type" "sprite_ai_task_type" NOT NULL,
	"input" text NOT NULL,
	"status" "sprite_ai_task_status" DEFAULT 'pending' NOT NULL,
	"result" text,
	"error_message" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "sprite_bean_transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"type" varchar(20) NOT NULL,
	"amount" integer NOT NULL,
	"balance_after" integer NOT NULL,
	"description" varchar(200),
	"related_type" varchar(30),
	"related_id" varchar(100),
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sprite_conversations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"role" varchar(20) NOT NULL,
	"content" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sprite_images" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"species" varchar(20) NOT NULL,
	"variant" varchar(50) NOT NULL,
	"level" integer NOT NULL,
	"image_url" text NOT NULL,
	"prompt_used" text,
	"is_active" boolean DEFAULT true,
	"asset_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sprite_interaction_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"action_type" varchar(30) NOT NULL,
	"ai_used" boolean DEFAULT false NOT NULL,
	"token_count" integer,
	"fatigue_level" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sprite_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" varchar(50) NOT NULL,
	"name" varchar(100) NOT NULL,
	"species" varchar(20) NOT NULL,
	"effect_minutes" integer NOT NULL,
	"price" integer NOT NULL,
	"icon" varchar(10),
	"description" text DEFAULT '',
	"is_active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "sprite_items_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "sprite_text_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"species" varchar(20) NOT NULL,
	"variant" varchar(50) NOT NULL,
	"level" integer NOT NULL,
	"text_type" "sprite_text_type" NOT NULL,
	"trigger_condition" text NOT NULL,
	"response_text" text NOT NULL,
	"status" "sprite_text_status" DEFAULT 'draft' NOT NULL,
	"ai_task_id" uuid,
	"error_message" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subscription_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"plan" varchar(50) NOT NULL,
	"amount" integer NOT NULL,
	"payment_method" varchar(20) NOT NULL,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"refund_amount" integer DEFAULT 0 NOT NULL,
	"transaction_id" varchar(100),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "system_presets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"category" varchar(50) NOT NULL,
	"project_type" varchar(20),
	"title" varchar(200) NOT NULL,
	"content" text NOT NULL,
	"description" text,
	"sort_order" integer DEFAULT 0,
	"is_published" boolean DEFAULT false,
	"created_by" uuid,
	"updated_by" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "template_comments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"template_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"content" text NOT NULL,
	"parent_comment_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "template_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_template_id" uuid NOT NULL,
	"content" text NOT NULL,
	"version_number" integer DEFAULT 1 NOT NULL,
	"deleted_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_sprite_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"item_code" varchar(50) NOT NULL,
	"quantity" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_sprites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"species" varchar(20),
	"variant" varchar(50),
	"level" integer DEFAULT 1 NOT NULL,
	"custom_name" varchar(100),
	"user_nickname" varchar(100),
	"companion_style" "sprite_companion_style" DEFAULT 'quiet',
	"total_active_days" integer DEFAULT 0,
	"bonus_days" integer DEFAULT 0,
	"last_active_date" timestamp,
	"position_x" integer DEFAULT 20,
	"position_y" integer DEFAULT 80,
	"is_hatched" boolean DEFAULT false,
	"guide_step" integer DEFAULT 0,
	"secret_shop_found" boolean DEFAULT false,
	"bean_balance" integer DEFAULT 0,
	"total_bean_spent" integer DEFAULT 0,
	"total_xp" integer DEFAULT 0,
	"converted_days" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_sprites_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "withdrawal_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"amount" integer NOT NULL,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"note" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "subscriptions" ALTER COLUMN "status" SET DEFAULT 'free';--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "genre_tag" "genre";--> statement-breakpoint
ALTER TABLE "templates" ADD COLUMN "review_reason" text;--> statement-breakpoint
ALTER TABLE "templates" ADD COLUMN "is_published" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "templates" ADD COLUMN "comments_count" integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE "templates" ADD COLUMN "likes_count" integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "bean_type" varchar(20);--> statement-breakpoint
ALTER TABLE "user_templates" ADD COLUMN "category" varchar(100);--> statement-breakpoint
ALTER TABLE "user_templates" ADD COLUMN "description" text;--> statement-breakpoint
ALTER TABLE "user_templates" ADD COLUMN "is_from_purchase" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "user_templates" ADD COLUMN "can_republish" boolean DEFAULT true;--> statement-breakpoint
ALTER TABLE "user_templates" ADD COLUMN "audit_status" varchar(20);--> statement-breakpoint
ALTER TABLE "user_templates" ADD COLUMN "deleted_at" timestamp;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "display_id" varchar(12);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "is_admin" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "admin_level" integer;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "banned_from_publish" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "banned_from_payment" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "last_active_at" timestamp;--> statement-breakpoint
ALTER TABLE "admin_audit_logs" ADD CONSTRAINT "admin_audit_logs_admin_id_users_id_fk" FOREIGN KEY ("admin_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "art_assets" ADD CONSTRAINT "art_assets_replaced_by_art_assets_id_fk" FOREIGN KEY ("replaced_by") REFERENCES "public"."art_assets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "art_assets" ADD CONSTRAINT "art_assets_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "art_assets" ADD CONSTRAINT "art_assets_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recharge_orders" ADD CONSTRAINT "recharge_orders_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sprite_bean_transactions" ADD CONSTRAINT "sprite_bean_transactions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sprite_conversations" ADD CONSTRAINT "sprite_conversations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sprite_images" ADD CONSTRAINT "sprite_images_asset_id_art_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."art_assets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sprite_interaction_log" ADD CONSTRAINT "sprite_interaction_log_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscription_orders" ADD CONSTRAINT "subscription_orders_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "system_presets" ADD CONSTRAINT "system_presets_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "system_presets" ADD CONSTRAINT "system_presets_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "template_comments" ADD CONSTRAINT "template_comments_template_id_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."templates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "template_comments" ADD CONSTRAINT "template_comments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "template_versions" ADD CONSTRAINT "template_versions_user_template_id_user_templates_id_fk" FOREIGN KEY ("user_template_id") REFERENCES "public"."user_templates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_sprite_items" ADD CONSTRAINT "user_sprite_items_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_sprites" ADD CONSTRAINT "user_sprites_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "withdrawal_requests" ADD CONSTRAINT "withdrawal_requests_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_display_id_unique" UNIQUE("display_id");