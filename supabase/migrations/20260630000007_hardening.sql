-- Phase 9: Security hardening
-- Fixes the two deferred security warnings from Supabase Advisors:
-- 1. set_updated_at() has mutable search_path
-- 2. pg_trgm in public schema (acceptable, just acknowledge)

-- Fix mutable search_path on the trigger function
alter function set_updated_at() set search_path = public;
