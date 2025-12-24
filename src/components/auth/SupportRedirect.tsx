import { useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useSupportRole } from '@/hooks/useSupportRole';
import { useAuth } from '@/contexts/AuthContext';

// Routes that support users ARE allowed to access
const SUPPORT_ALLOWED_ROUTES = [
  '/support-home',
  '/support-messages',
  '/support-reservations',
  '/support-account',
  '/booking/', // Allow viewing booking details
  '/auth',
];

/**
 * Component that redirects support users away from non-support pages
 * Place this inside the router but wrap main app content
 */
export const SupportRedirect = ({ children }: { children: React.ReactNode }) => {
  const { isSupport, loading: supportLoading } = useSupportRole();
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    // Wait for both auth and support role to load
    if (authLoading || supportLoading) return;
    
    // Only redirect if user is logged in and is support
    if (!user || !isSupport) return;

    const currentPath = location.pathname;
    
    // Check if current path is allowed for support users
    const isAllowed = SUPPORT_ALLOWED_ROUTES.some(route => 
      currentPath === route || currentPath.startsWith(route)
    );

    // If not allowed, redirect to support home
    if (!isAllowed) {
      navigate('/support-home', { replace: true });
    }
  }, [isSupport, supportLoading, user, authLoading, location.pathname, navigate]);

  return <>{children}</>;
};
