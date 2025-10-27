-- Reset booking_holds RLS policies to a clean permissive set
DO $$
DECLARE pol RECORD;
BEGIN
  -- Ensure RLS is enabled
  IF EXISTS (
    SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'booking_holds'
  ) THEN
    EXECUTE 'ALTER TABLE public.booking_holds ENABLE ROW LEVEL SECURITY';

    -- Drop all existing policies to avoid restrictive conflicts
    FOR pol IN 
      SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = 'booking_holds'
    LOOP
      EXECUTE 'DROP POLICY "' || pol.policyname || '" ON public.booking_holds';
    END LOOP;

    -- Recreate permissive policies for authenticated users on their own rows
    EXECUTE 'CREATE POLICY "Users can insert own booking holds" ON public.booking_holds
      FOR INSERT TO authenticated
      WITH CHECK (auth.uid() = user_id)';

    EXECUTE 'CREATE POLICY "Users can view own booking holds" ON public.booking_holds
      FOR SELECT TO authenticated
      USING (auth.uid() = user_id)';

    EXECUTE 'CREATE POLICY "Users can update own booking holds" ON public.booking_holds
      FOR UPDATE TO authenticated
      USING (auth.uid() = user_id)';

    EXECUTE 'CREATE POLICY "Users can delete own booking holds" ON public.booking_holds
      FOR DELETE TO authenticated
      USING (auth.uid() = user_id)';
  END IF;
END$$;