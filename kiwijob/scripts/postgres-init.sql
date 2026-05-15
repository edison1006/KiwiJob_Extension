-- Run as a PostgreSQL superuser (e.g. postgres or your macOS username), database postgres:
--   psql -U postgres -d postgres -f scripts/postgres-init.sql
--   psql -U "$USER" -d postgres -f scripts/postgres-init.sql

DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'kiwijob') THEN
    CREATE ROLE kiwijob WITH LOGIN PASSWORD 'kiwijob';
  ELSE
    ALTER ROLE kiwijob WITH LOGIN PASSWORD 'kiwijob';
  END IF;
END
$$;

SELECT format('CREATE DATABASE %I OWNER kiwijob', 'kiwijob')
WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = 'kiwijob')
\gexec
