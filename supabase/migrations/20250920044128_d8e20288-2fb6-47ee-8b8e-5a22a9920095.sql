-- Enable PostGIS extension for geospatial queries
CREATE EXTENSION IF NOT EXISTS postgis;

-- Create enum types
CREATE TYPE user_role AS ENUM ('renter', 'host', 'both');
CREATE TYPE vehicle_size AS ENUM ('compact', 'midsize', 'suv', 'truck');
CREATE TYPE booking_status AS ENUM ('pending', 'held', 'paid', 'active', 'completed', 'canceled', 'refunded');
CREATE TYPE spot_status AS ENUM ('active', 'inactive', 'pending_approval');
CREATE TYPE verification_status AS ENUM ('unverified', 'pending', 'verified', 'rejected');

-- Users/Profiles table
CREATE TABLE public.profiles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  phone TEXT,
  first_name TEXT,
  last_name TEXT,
  role user_role NOT NULL DEFAULT 'renter',
  avatar_url TEXT,
  rating DECIMAL(3,2) DEFAULT 0.0,
  review_count INTEGER DEFAULT 0,
  strikes INTEGER DEFAULT 0,
  phone_verified BOOLEAN DEFAULT FALSE,
  email_verified BOOLEAN DEFAULT FALSE,
  kyc_status verification_status DEFAULT 'unverified',
  stripe_customer_id TEXT,
  stripe_account_id TEXT,
  stripe_account_enabled BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Vehicles table
CREATE TABLE public.vehicles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.profiles(user_id) ON DELETE CASCADE,
  license_plate TEXT NOT NULL,
  make TEXT,
  model TEXT,
  year INTEGER,
  color TEXT,
  size_class vehicle_size NOT NULL,
  is_ev BOOLEAN DEFAULT FALSE,
  is_primary BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Parking spots table
CREATE TABLE public.spots (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  host_id UUID NOT NULL REFERENCES public.profiles(user_id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  address TEXT NOT NULL,
  latitude DECIMAL(10, 8) NOT NULL,
  longitude DECIMAL(11, 8) NOT NULL,
  location GEOGRAPHY(POINT, 4326) NOT NULL,
  size_constraints vehicle_size[] DEFAULT '{}',
  hourly_rate DECIMAL(10,2) NOT NULL,
  daily_rate DECIMAL(10,2),
  has_ev_charging BOOLEAN DEFAULT FALSE,
  is_covered BOOLEAN DEFAULT FALSE,
  is_secure BOOLEAN DEFAULT FALSE,
  access_notes TEXT,
  host_rules TEXT,
  cancellation_policy TEXT,
  status spot_status DEFAULT 'pending_approval',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Spot photos table
CREATE TABLE public.spot_photos (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  spot_id UUID NOT NULL REFERENCES public.spots(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  is_primary BOOLEAN DEFAULT FALSE,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Availability rules table
CREATE TABLE public.availability_rules (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  spot_id UUID NOT NULL REFERENCES public.spots(id) ON DELETE CASCADE,
  day_of_week INTEGER NOT NULL CHECK (day_of_week >= 0 AND day_of_week <= 6),
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  is_available BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Calendar overrides table (for specific dates)
CREATE TABLE public.calendar_overrides (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  spot_id UUID NOT NULL REFERENCES public.spots(id) ON DELETE CASCADE,
  override_date DATE NOT NULL,
  start_time TIME,
  end_time TIME,
  is_available BOOLEAN NOT NULL,
  reason TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Booking holds table (for preventing double-booking)
CREATE TABLE public.booking_holds (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  spot_id UUID NOT NULL REFERENCES public.spots(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(user_id) ON DELETE CASCADE,
  start_at TIMESTAMP WITH TIME ZONE NOT NULL,
  end_at TIMESTAMP WITH TIME ZONE NOT NULL,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  idempotency_key TEXT UNIQUE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Bookings table
CREATE TABLE public.bookings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  spot_id UUID NOT NULL REFERENCES public.spots(id) ON DELETE CASCADE,
  renter_id UUID NOT NULL REFERENCES public.profiles(user_id) ON DELETE CASCADE,
  vehicle_id UUID REFERENCES public.vehicles(id),
  start_at TIMESTAMP WITH TIME ZONE NOT NULL,
  end_at TIMESTAMP WITH TIME ZONE NOT NULL,
  status booking_status NOT NULL DEFAULT 'pending',
  hourly_rate DECIMAL(10,2) NOT NULL,
  total_hours DECIMAL(6,2) NOT NULL,
  subtotal DECIMAL(10,2) NOT NULL,
  platform_fee DECIMAL(10,2) NOT NULL,
  total_amount DECIMAL(10,2) NOT NULL,
  stripe_payment_intent_id TEXT,
  stripe_charge_id TEXT,
  cancellation_reason TEXT,
  check_in_photo_url TEXT,
  check_out_photo_url TEXT,
  idempotency_key TEXT UNIQUE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Reviews table
CREATE TABLE public.reviews (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  booking_id UUID NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  reviewer_id UUID NOT NULL REFERENCES public.profiles(user_id) ON DELETE CASCADE,
  reviewee_id UUID NOT NULL REFERENCES public.profiles(user_id) ON DELETE CASCADE,
  rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
  comment TEXT,
  is_public BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Messages table
CREATE TABLE public.messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  booking_id UUID REFERENCES public.bookings(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES public.profiles(user_id) ON DELETE CASCADE,
  recipient_id UUID NOT NULL REFERENCES public.profiles(user_id) ON DELETE CASCADE,
  message TEXT NOT NULL,
  read_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create indexes for performance
CREATE INDEX idx_spots_location ON public.spots USING GIST (location);
CREATE INDEX idx_spots_host_id ON public.spots (host_id);
CREATE INDEX idx_bookings_spot_id ON public.bookings (spot_id);
CREATE INDEX idx_bookings_renter_id ON public.bookings (renter_id);
CREATE INDEX idx_bookings_dates ON public.bookings (start_at, end_at);
CREATE INDEX idx_booking_holds_spot_dates ON public.booking_holds (spot_id, start_at, end_at);
CREATE INDEX idx_vehicles_user_id ON public.vehicles (user_id);

-- Enable Row Level Security
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vehicles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.spots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.spot_photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.availability_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.calendar_overrides ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.booking_holds ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

-- RLS Policies for profiles
CREATE POLICY "Users can view all profiles" ON public.profiles FOR SELECT USING (true);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = user_id);

-- RLS Policies for vehicles
CREATE POLICY "Users can manage own vehicles" ON public.vehicles FOR ALL USING (auth.uid() = user_id);

-- RLS Policies for spots
CREATE POLICY "Anyone can view active spots" ON public.spots FOR SELECT USING (status = 'active');
CREATE POLICY "Hosts can manage own spots" ON public.spots FOR ALL USING (auth.uid() = host_id);

-- RLS Policies for spot photos
CREATE POLICY "Anyone can view spot photos" ON public.spot_photos FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.spots WHERE id = spot_id AND status = 'active')
);
CREATE POLICY "Hosts can manage own spot photos" ON public.spot_photos FOR ALL USING (
  EXISTS (SELECT 1 FROM public.spots WHERE id = spot_id AND auth.uid() = host_id)
);

-- RLS Policies for availability rules
CREATE POLICY "Anyone can view availability rules" ON public.availability_rules FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.spots WHERE id = spot_id AND status = 'active')
);
CREATE POLICY "Hosts can manage own availability rules" ON public.availability_rules FOR ALL USING (
  EXISTS (SELECT 1 FROM public.spots WHERE id = spot_id AND auth.uid() = host_id)
);

-- RLS Policies for calendar overrides
CREATE POLICY "Anyone can view calendar overrides" ON public.calendar_overrides FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.spots WHERE id = spot_id AND status = 'active')
);
CREATE POLICY "Hosts can manage own calendar overrides" ON public.calendar_overrides FOR ALL USING (
  EXISTS (SELECT 1 FROM public.spots WHERE id = spot_id AND auth.uid() = host_id)
);

-- RLS Policies for booking holds
CREATE POLICY "Users can manage own booking holds" ON public.booking_holds FOR ALL USING (auth.uid() = user_id);

-- RLS Policies for bookings
CREATE POLICY "Users can view own bookings" ON public.bookings FOR SELECT USING (
  auth.uid() = renter_id OR 
  EXISTS (SELECT 1 FROM public.spots WHERE id = spot_id AND auth.uid() = host_id)
);
CREATE POLICY "Renters can create bookings" ON public.bookings FOR INSERT WITH CHECK (auth.uid() = renter_id);
CREATE POLICY "Users can update own bookings" ON public.bookings FOR UPDATE USING (
  auth.uid() = renter_id OR 
  EXISTS (SELECT 1 FROM public.spots WHERE id = spot_id AND auth.uid() = host_id)
);

-- RLS Policies for reviews
CREATE POLICY "Anyone can view public reviews" ON public.reviews FOR SELECT USING (is_public = true);
CREATE POLICY "Users can create reviews for their bookings" ON public.reviews FOR INSERT WITH CHECK (
  auth.uid() = reviewer_id AND
  EXISTS (
    SELECT 1 FROM public.bookings 
    WHERE id = booking_id AND 
    (renter_id = auth.uid() OR EXISTS (SELECT 1 FROM public.spots WHERE id = spot_id AND host_id = auth.uid()))
  )
);

-- RLS Policies for messages
CREATE POLICY "Users can view their messages" ON public.messages FOR SELECT USING (
  auth.uid() = sender_id OR auth.uid() = recipient_id
);
CREATE POLICY "Users can send messages" ON public.messages FOR INSERT WITH CHECK (auth.uid() = sender_id);
CREATE POLICY "Users can update their messages" ON public.messages FOR UPDATE USING (
  auth.uid() = sender_id OR auth.uid() = recipient_id
);

-- Create function to handle new user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (user_id, email, email_verified)
  VALUES (
    NEW.id,
    NEW.email,
    NEW.email_confirmed_at IS NOT NULL
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger for new user signup
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers for updated_at
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_vehicles_updated_at BEFORE UPDATE ON public.vehicles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_spots_updated_at BEFORE UPDATE ON public.spots FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_bookings_updated_at BEFORE UPDATE ON public.bookings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Create function to clean up expired holds
CREATE OR REPLACE FUNCTION public.cleanup_expired_holds()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM public.booking_holds WHERE expires_at < now();
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create function to check spot availability
CREATE OR REPLACE FUNCTION public.check_spot_availability(
  p_spot_id UUID,
  p_start_at TIMESTAMP WITH TIME ZONE,
  p_end_at TIMESTAMP WITH TIME ZONE
)
RETURNS BOOLEAN AS $$
BEGIN
  -- Check for conflicting bookings
  IF EXISTS (
    SELECT 1 FROM public.bookings 
    WHERE spot_id = p_spot_id 
    AND status NOT IN ('canceled', 'refunded')
    AND NOT (end_at <= p_start_at OR start_at >= p_end_at)
  ) THEN
    RETURN FALSE;
  END IF;
  
  -- Check for conflicting active holds
  IF EXISTS (
    SELECT 1 FROM public.booking_holds 
    WHERE spot_id = p_spot_id 
    AND expires_at > now()
    AND NOT (end_at <= p_start_at OR start_at >= p_end_at)
  ) THEN
    RETURN FALSE;
  END IF;
  
  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;