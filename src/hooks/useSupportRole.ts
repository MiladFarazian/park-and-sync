import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/lib/logger';

const log = logger.scope('useSupportRole');

export const useSupportRole = () => {
  const { user } = useAuth();
  const [isSupport, setIsSupport] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkSupportRole = async () => {
      if (!user) {
        setIsSupport(false);
        setLoading(false);
        return;
      }

      try {
        const { data, error } = await supabase
          .from('user_roles')
          .select('role')
          .eq('user_id', user.id)
          .eq('role', 'support')
          .maybeSingle();

        if (error) {
          console.error('Error checking support role:', error);
          setIsSupport(false);
        } else {
          setIsSupport(!!data);
        }
      } catch (err) {
        log.error('Error checking support role:', err);
        setIsSupport(false);
      } finally {
        setLoading(false);
      }
    };

    checkSupportRole();
  }, [user]);

  return { isSupport, loading };
};

// The hardcoded Parkzy Support user ID (for message lookups)
export const SUPPORT_USER_ID = '00000000-0000-0000-0000-000000000001';
