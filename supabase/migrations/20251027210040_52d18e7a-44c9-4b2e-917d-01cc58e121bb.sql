-- Remove restrictive policies that block inserts into booking_holds
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' AND tablename = 'booking_holds' AND policyname = 'Service role can manage all booking holds'
  ) THEN
    EXECUTE 'DROP POLICY "Service role can manage all booking holds" ON public.booking_holds';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' AND tablename = 'booking_holds' AND policyname = 'Users can manage own booking holds'
  ) THEN
    EXECUTE 'DROP POLICY "Users can manage own booking holds" ON public.booking_holds';
  END IF;
END$$;

-- Ensure the essential policies exist (insert/select/update/delete for own rows)
DO $$
BEGIN
  -- Insert
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' AND tablename = 'booking_holds' AND policyname = 'Users can create their own booking holds'
  ) THEN
    EXECUTE 'CREATE POLICY "Users can create their own booking holds" ON public.booking_holds
      FOR INSERT TO authenticated
      WITH CHECK (auth.uid() = user_id)';
  END IF;

  -- Select
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' AND tablename = 'booking_holds' AND policyname = 'Users can view their own booking holds'
  ) THEN
    EXECUTE 'CREATE POLICY "Users can view their own booking holds" ON public.booking_holds
      FOR SELECT TO authenticated
      USING (auth.uid() = user_id)';
  END IF;

  -- Update
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' AND tablename = 'booking_holds' AND policyname = 'Users can update own booking holds'
  ) THEN
    EXECUTE 'CREATE POLICY "Users can update own booking holds" ON public.booking_holds
      FOR UPDATE TO authenticated
      USING (auth.uid() = user_id)';
  END IF;

  -- Delete
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' AND tablename = 'booking_holds' AND policyname = 'Users can delete own booking holds'
  ) THEN
    EXECUTE 'CREATE POLICY "Users can delete own booking holds" ON public.booking_holds
      FOR DELETE TO authenticated
      USING (auth.uid() = user_id)';
  END IF;
END$$;