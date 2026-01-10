import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { getStripeFlowState, clearStripeFlowState, isStandaloneMode } from '@/lib/stripeSetupFlow';

/**
 * Hook to detect and handle return from Stripe setup in PWA mode
 * Should be used in a component that renders on app startup (e.g., AppLayout or Profile)
 */
export const useStripeReturnFlow = () => {
  const navigate = useNavigate();
  const hasChecked = useRef(false);

  useEffect(() => {
    // Only run once and only in standalone mode
    if (hasChecked.current || !isStandaloneMode()) return;
    hasChecked.current = true;

    const checkStripeReturn = async () => {
      const flowState = getStripeFlowState();
      if (!flowState) return;

      // Clear state immediately to prevent re-processing
      clearStripeFlowState();

      // Show loading toast
      const loadingToast = toast.loading('Checking Stripe setup status...');

      try {
        // Check Stripe connection status
        const { data, error } = await supabase.functions.invoke('check-stripe-connect-status');
        
        toast.dismiss(loadingToast);

        if (error) {
          toast.error('Could not verify Stripe status. Please try again.');
          navigate(flowState.returnRoute);
          return;
        }

        const isConnected = data?.connected && data?.charges_enabled;

        if (isConnected) {
          toast.success('Stripe connected successfully!', {
            description: 'You can now receive payments for your parking spots.',
          });
        } else if (data?.details_submitted) {
          toast.info('Stripe setup in progress', {
            description: 'Your account is being verified. This may take a few minutes.',
          });
        } else {
          toast.info('Stripe setup not completed', {
            description: 'You can continue setup anytime from your profile.',
          });
        }

        // Navigate back to where they were
        navigate(flowState.returnRoute);
      } catch (err) {
        toast.dismiss(loadingToast);
        toast.error('Something went wrong. Please try again.');
        navigate(flowState.returnRoute);
      }
    };

    // Small delay to ensure app is fully loaded
    const timer = setTimeout(checkStripeReturn, 500);
    return () => clearTimeout(timer);
  }, [navigate]);
};
