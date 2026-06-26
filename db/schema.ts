import { sql } from "drizzle-orm";
import { text, integer, sqliteTable } from "drizzle-orm/sqlite-core";

// ---------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------
export const users = sqliteTable("users", {
  id:           text("id").primaryKey(),
  email:        text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  name:         text("name"),
  createdAt:    integer("created_at", { mode: "timestamp" })
                  .notNull()
                  .default(sql`(unixepoch())`),
});

// ---------------------------------------------------------------------------
// Levels — local cache of level data pulled from the GD servers.
// We NEVER call the GD API live on a spin. The /api/levels/random route
// reads from this table; the /api/sync-levels route writes to it.
// ---------------------------------------------------------------------------
export const levels = sqliteTable("levels", {
  id:           text("id").primaryKey(),  // our internal cuid
  gdId:         integer("gd_id").notNull().unique(),
  name:         text("name").notNull(),
  author:       text("author").notNull(),

  // Difficulty: "Auto"|"Easy"|"Normal"|"Hard"|"Harder"|"Insane"
  //             |"Easy Demon"|"Medium Demon"|"Hard Demon"|"Insane Demon"|"Extreme Demon"
  difficulty:   text("difficulty").notNull(),
  isDemon:      integer("is_demon", { mode: "boolean" }).notNull().default(false),
  stars:        integer("stars").notNull().default(0),

  // Rating tier: "none"|"rated"|"featured"|"epic"|"legendary"|"mythic"
  // Derived from cp value: 0=none,1=rated,2=featured,3=epic,4=legendary,5=mythic
  ratingTier:   text("rating_tier").notNull().default("none"),

  downloads:    integer("downloads").notNull().default(0),
  likes:        integer("likes").notNull().default(0),
  length:       text("length"),           // "Tiny"|"Short"|"Medium"|"Long"|"XL"|"Platformer"
  objects:      integer("objects"),
  songName:     text("song_name"),
  songAuthor:   text("song_author"),
  description:  text("description"),
  gameVersion:  text("game_version"),

  lastSyncedAt: integer("last_synced_at", { mode: "timestamp" })
                  .notNull()
                  .default(sql`(unixepoch())`),
});

// ---------------------------------------------------------------------------
// Attempts — one row per level assigned to a user.
// Tracks the full lifecycle: pending → completed | skipped | abandoned
// ---------------------------------------------------------------------------
export const attempts = sqliteTable("attempts", {
  id:           text("id").primaryKey(),
  userId:       text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  levelId:      text("level_id").notNull().references(() => levels.id, { onDelete: "cascade" }),

  // status: "pending" | "completed" | "skipped" | "abandoned"
  status:       text("status").notNull().default("pending"),

  // User-entered progress notes (markdown supported in the UI)
  progressNote: text("progress_note"),

  // Numeric best %; 0–100. Optional — user can leave blank
  bestPercent:  integer("best_percent"),

  // How many in-game attempts they've put in (self-reported)
  attemptCount: integer("attempt_count").notNull().default(0),

  // How long they've been grinding this level (minutes, self-reported)
  timeSpentMin: integer("time_spent_min").notNull().default(0),

  // Difficulty chosen when spinning (may differ from the level's actual diff)
  requestedDiff: text("requested_diff"),

  // Rating tier filter active when the spin happened
  requestedTier: text("requested_tier"),

  spunAt:       integer("spun_at", { mode: "timestamp" })
                  .notNull()
                  .default(sql`(unixepoch())`),
  resolvedAt:   integer("resolved_at", { mode: "timestamp" }),
  updatedAt:    integer("updated_at", { mode: "timestamp" })
                  .notNull()
                  .default(sql`(unixepoch())`),
});

// ---------------------------------------------------------------------------
// Types exported for use in the app layer
// ---------------------------------------------------------------------------
export type User    = typeof users.$inferSelect;
export type Level   = typeof levels.$inferSelect;
export type Attempt = typeof attempts.$inferSelect;

export type AttemptWithLevel = Attempt & { level: Level };

// ---------------------------------------------------------------------------
// Drizzle relations — required for query.attempts.findMany({ with: { level } })
// ---------------------------------------------------------------------------
import { relations } from "drizzle-orm";

export const usersRelations = relations(users, ({ many }) => ({
  attempts: many(attempts),
}));

export const levelsRelations = relations(levels, ({ many }) => ({
  attempts: many(attempts),
}));

export const attemptsRelations = relations(attempts, ({ one }) => ({
  user:  one(users,  { fields: [attempts.userId],  references: [users.id]  }),
  level: one(levels, { fields: [attempts.levelId], references: [levels.id] }),
}));
