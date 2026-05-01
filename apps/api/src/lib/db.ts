import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import * as schema from "@repo/database";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error(
    "DATABASE_URL environment variable is not set. " +
    "Make sure apps/api/.env exists with DATABASE_URL set."
  );
}

export const queryClient = postgres(connectionString, { max: 10 });
export const db = drizzle(queryClient, { schema });
