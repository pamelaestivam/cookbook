-- Only the auth.users trigger should run this; it is not an API endpoint.
revoke execute on function public.create_default_cookbook() from public, anon, authenticated;
