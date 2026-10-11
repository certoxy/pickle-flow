-- Broadcast game score and status changes to all authorized Game Day screens.
do $$
begin
  alter publication supabase_realtime add table public.games;
exception
  when duplicate_object then null;
end
$$;
