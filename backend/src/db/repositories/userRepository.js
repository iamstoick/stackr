import { query, queryOne } from '../pool.js';

function toUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    googleId: row.google_id,
    email: row.email,
    name: row.name,
    avatarUrl: row.avatar_url,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function findById(id) {
  return toUser(await queryOne('SELECT * FROM users WHERE id = $1', [id]));
}

export async function findByGoogleId(googleId) {
  return toUser(await queryOne('SELECT * FROM users WHERE google_id = $1', [googleId]));
}

/**
 * Creates the user, or updates the mutable profile fields if the Google account
 * (or the email it owns) is already known.
 */
export async function upsertFromGoogleProfile({ googleId, email, name, avatarUrl }) {
  const { rows } = await query(
    `INSERT INTO users (google_id, email, name, avatar_url)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (google_id) DO UPDATE
       SET email = EXCLUDED.email,
           name = EXCLUDED.name,
           avatar_url = EXCLUDED.avatar_url
     RETURNING *`,
    [googleId, email, name ?? null, avatarUrl ?? null],
  );
  return toUser(rows[0]);
}

export default { findById, findByGoogleId, upsertFromGoogleProfile };
