-- Add session_duration_minutes to psicologos table
ALTER TABLE psicologos ADD COLUMN session_duration_minutes INTEGER DEFAULT 45;
