-- Run as a PostgreSQL superuser (e.g. postgres or your macOS username), database postgres:
--   psql -U postgres -d postgres -f scripts/postgres-init.sql
--   psql -U "$USER" -d postgres -f scripts/postgres-init.sql

DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'easyjob') THEN
    CREATE ROLE easyjob WITH LOGIN PASSWORD 'easyjob';
  ELSE
    ALTER ROLE easyjob WITH LOGIN PASSWORD 'easyjob';
  END IF;
END
$$;

SELECT format('CREATE DATABASE %I OWNER easyjob', 'easyjob')
WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = 'easyjob')
\gexec
