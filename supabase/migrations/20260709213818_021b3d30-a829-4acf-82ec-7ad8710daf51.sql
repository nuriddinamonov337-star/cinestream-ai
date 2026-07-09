
REVOKE EXECUTE ON FUNCTION public.is_user_premium(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_user_premium(UUID) TO service_role;
