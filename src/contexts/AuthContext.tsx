import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface Profile {
  id: string;
  user_id: string;
  email: string;
  first_name?: string;
  last_name?: string;
  phone?: string;
  role: 'renter' | 'host' | 'both';
  avatar_url?: string;
  rating: number;
  review_count: number;
  phone_verified: boolean;
  email_verified: boolean;
  stripe_account_enabled?: boolean;
  notification_booking_updates?: boolean;
  notification_host_messages?: boolean;
}

interface AuthContextType {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  isEmailVerified: boolean;
  signUp: (email: string, password: string, firstName?: string, lastName?: string, phone?: string) => Promise<{ error: any }>;
  signIn: (email: string, password: string) => Promise<{ error: any; unverified?: boolean }>;
  signOut: () => Promise<void>;
  updateProfile: (updates: Partial<Profile>) => Promise<{ error: any }>;
  refreshProfile: () => Promise<void>;
  ensureProfileExists: () => Promise<{ error: any }>;
  resendVerificationEmail: () => Promise<{ error: any }>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const fetchProfile = async (userId: string) => {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('user_id', userId)
      .single();
    
    if (error) {
      console.error('Error fetching profile:', error);
      return null;
    }
    return data;
  };

  // Ensure a profile exists for the current user (upsert pattern)
  const ensureProfileExistsForUser = async (userId: string, email?: string | null, phone?: string | null) => {
    console.log('[Auth] Ensuring profile exists for user:', userId);
    const { error } = await supabase
      .from('profiles')
      .upsert({
        user_id: userId,
        email: email || null,
        phone: phone || null,
      }, { 
        onConflict: 'user_id',
        ignoreDuplicates: false 
      });
    
    if (error) {
      console.error('[Auth] Error ensuring profile exists:', error);
    }
    return { error };
  };

  useEffect(() => {
    // Handle session-only mode (remember me unchecked)
    const handleBeforeUnload = () => {
      const sessionOnly = sessionStorage.getItem('parkzy_session_only');
      if (sessionOnly === 'true') {
        // Clear auth data on browser close
        supabase.auth.signOut();
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);

    // Set up auth state listener FIRST
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        console.log('Auth state changed:', event, session?.user?.id);
        setSession(session);
        setUser(session?.user ?? null);

        if (session?.user) {
          // Fetch user profile - use setTimeout to avoid deadlock
          setTimeout(async () => {
            const profileData = await fetchProfile(session.user.id);
            setProfile(profileData);
            setLoading(false);
          }, 0);
        } else {
          setProfile(null);
          setLoading(false);
        }
      }
    );

    // Check for magic link tokens in URL hash (from email redirects)
    const hashParams = new URLSearchParams(window.location.hash.substring(1));
    const accessToken = hashParams.get('access_token');
    const refreshToken = hashParams.get('refresh_token');
    
    if (accessToken && refreshToken) {
      // Magic link tokens detected - set the session
      console.log('Magic link tokens detected, setting session...');
      supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken
      }).then(({ data, error }) => {
        if (error) {
          console.error('Error setting session from magic link:', error);
          setLoading(false);
        } else {
          console.log('Session set from magic link successfully');
          // Clean up the URL hash
          window.history.replaceState({}, '', window.location.pathname + window.location.search);
        }
      });
    } else {
      // No magic link tokens, get existing session
      supabase.auth.getSession().then(({ data: { session } }) => {
        setSession(session);
        setUser(session?.user ?? null);
        
        if (session?.user) {
          fetchProfile(session.user.id).then((profileData) => {
            setProfile(profileData);
            setLoading(false);
          });
        } else {
          setLoading(false);
        }
      });
    }

    return () => {
      subscription.unsubscribe();
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, []);

  const signUp = async (email: string, password: string, firstName?: string, lastName?: string, phone?: string) => {
    const redirectUrl = `${window.location.origin}/email-confirmation`;
    
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: redirectUrl,
        data: {
          first_name: firstName,
          last_name: lastName
        }
      }
    });

    if (error) {
      toast({
        title: "Sign Up Failed",
        description: error.message,
        variant: "destructive"
      });
    } else {
      toast({
        title: "Sign Up Successful",
        description: "Please check your email to verify your account.",
      });

      // Link any guest bookings to the new user
      if (data.user) {
        try {
          const { data: linkData, error: linkError } = await supabase.functions.invoke('link-guest-bookings', {
            body: { 
              user_id: data.user.id, 
              email,
              phone,
              first_name: firstName
            }
          });
          
          if (linkError) {
            console.error('Error linking guest bookings:', linkError);
          } else if (linkData?.linked_count > 0) {
            toast({
              title: "Bookings Linked",
              description: `${linkData.linked_count} previous booking(s) have been linked to your account.`,
            });
          }
        } catch (err) {
          console.error('Failed to link guest bookings:', err);
        }
      }
    }

    return { error };
  };

  const signIn = async (email: string, password: string): Promise<{ error: any; unverified?: boolean }> => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      toast({
        title: "Sign In Failed",
        description: error.message,
        variant: "destructive"
      });
      return { error };
    }

    // Check if email is verified - block login if not
    if (data.user && !data.user.email_confirmed_at) {
      // Sign out the user immediately
      await supabase.auth.signOut();
      
      toast({
        title: "Email Not Verified",
        description: "Please check your email and click the verification link before signing in.",
        variant: "destructive"
      });
      
      return { error: new Error('Email not verified'), unverified: true };
    }

    return { error: null };
  };

  const signOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) {
      toast({
        title: "Sign Out Failed",
        description: error.message,
        variant: "destructive"
      });
    }
  };

  const updateProfile = async (updates: Partial<Profile>) => {
    if (!user) return { error: new Error('No user logged in') };

    console.log('[Auth] Updating profile for user:', user.id, updates);
    
    // Use upsert instead of update to handle cases where profile doesn't exist
    const { error } = await supabase
      .from('profiles')
      .upsert({
        user_id: user.id,
        ...updates,
        updated_at: new Date().toISOString(),
      }, { 
        onConflict: 'user_id' 
      });

    if (error) {
      console.error('[Auth] Profile update failed:', error);
      toast({
        title: "Profile Update Failed",
        description: error.message,
        variant: "destructive"
      });
    } else {
      // Refresh profile
      const updatedProfile = await fetchProfile(user.id);
      setProfile(updatedProfile);
      toast({
        title: "Profile Updated",
        description: "Your profile has been updated successfully.",
      });
    }

    return { error };
  };

  const refreshProfile = async () => {
    if (!user) return;
    console.log('[Auth] Refreshing profile for user:', user.id);
    const profileData = await fetchProfile(user.id);
    setProfile(profileData);
  };

  const ensureProfileExists = async () => {
    if (!user) return { error: new Error('No user logged in') };
    return ensureProfileExistsForUser(user.id, user.email, user.phone);
  };

  const resendVerificationEmail = async () => {
    const email = user?.email || profile?.email;
    if (!email) return { error: new Error('No email address found') };

    const { error } = await supabase.auth.resend({
      type: 'signup',
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/email-confirmation`
      }
    });

    if (error) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive"
      });
    } else {
      toast({
        title: "Verification email sent",
        description: `Check ${email} for the verification link`
      });
    }

    return { error };
  };

  // Compute email verification status
  // User is verified if: they confirmed via Supabase OR profile has email_verified = true
  // Phone-only users without email are considered verified for email purposes
  const isEmailVerified = (() => {
    // No user = not verified
    if (!user) return false;
    
    // No email = phone-only user, treat as verified for email purposes
    const email = user.email || profile?.email;
    if (!email) return true;
    
    // Check Supabase auth confirmation
    if (user.email_confirmed_at) return true;
    
    // Check profile flag
    if (profile?.email_verified) return true;
    
    return false;
  })();

  const value = {
    user,
    session,
    profile,
    loading,
    isEmailVerified,
    signUp,
    signIn,
    signOut,
    updateProfile,
    refreshProfile,
    ensureProfileExists,
    resendVerificationEmail,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};