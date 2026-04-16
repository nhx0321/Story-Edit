import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

const connectionString = process.env.DATABASE_URL || 'postgresql://story_edit:story_edit_dev@localhost:5432/story_edit';

const client = postgres(connectionString);
export const db = drizzle(client, { schema });
