BEGIN;
SELECT plan(12);

SELECT ok((SELECT relrowsecurity FROM pg_class WHERE oid = 'public.deck_share_sessions'::regclass), 'viewer sessions have RLS enabled');
SELECT ok((SELECT relrowsecurity FROM pg_class WHERE oid = 'public.deck_share_events'::regclass), 'viewer events have RLS enabled');
SELECT ok((SELECT relrowsecurity FROM pg_class WHERE oid = 'public.deck_share_rate_limits'::regclass), 'rate-limit records have RLS enabled');
SELECT ok(NOT has_table_privilege('anon', 'public.deck_shares', 'SELECT'), 'anonymous role cannot read share links');
SELECT ok(NOT has_table_privilege('authenticated', 'public.deck_shares', 'SELECT'), 'authenticated browser role cannot read share links directly');
SELECT ok(NOT has_table_privilege('anon', 'public.deck_share_sessions', 'SELECT'), 'anonymous role cannot read viewer sessions');
SELECT ok(NOT has_table_privilege('authenticated', 'public.deck_share_events', 'SELECT'), 'authenticated browser role cannot read viewer events directly');
SELECT ok(has_table_privilege('service_role', 'public.deck_share_sessions', 'SELECT,INSERT,UPDATE,DELETE'), 'server role can manage viewer sessions');
SELECT ok(NOT has_function_privilege('anon', 'public.consume_deck_share_rate_limit(text,integer,integer)', 'EXECUTE'), 'anonymous role cannot consume rate limits');
SELECT ok(NOT has_function_privilege('authenticated', 'public.get_deck_share_analytics(text,uuid)', 'EXECUTE'), 'authenticated browser role cannot call analytics RPC');
SELECT ok(has_function_privilege('service_role', 'public.get_deck_share_analytics(text,uuid)', 'EXECUTE'), 'server role can call owner-scoped analytics RPC');
SELECT ok(NOT has_function_privilege('anon', 'public.update_deck_share_session_activity()', 'EXECUTE'), 'anonymous role cannot call the session update trigger function');

SELECT * FROM finish();
ROLLBACK;
