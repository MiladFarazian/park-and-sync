/**
 * Booking Status Terminology System
 * 
 * Displays different status labels based on:
 * - User perspective (driver/host)
 * - Spot type (instant_book vs requires_confirmation)
 * - Booking state and timing
 */

export type BookingStatusLabel = 
  | 'Requested'
  | 'Booked'
  | 'Active'
  | 'Completed'
  | 'Declined'
  | 'Cancelled';

export type BookingStatusVariant = 
  | 'default'      // Primary color (Active, Booked)
  | 'secondary'    // Muted (Completed)
  | 'outline'      // Outline style (Requested, Pending)
  | 'destructive'; // Red (Cancelled, Declined)

export interface BookingStatusResult {
  label: BookingStatusLabel;
  variant: BookingStatusVariant;
}

export interface BookingStatusInput {
  /** The database status of the booking */
  status: string;
  /** Whether the spot allows instant booking */
  instantBook: boolean;
  /** Booking start time */
  startAt: Date | string;
  /** Booking end time */
  endAt: Date | string;
  /** Whether the current user is viewing as host */
  isHost: boolean;
  /** Current date/time (optional, defaults to now) */
  now?: Date;
}

/**
 * Determines the appropriate status label and variant based on booking context
 */
export function getBookingStatus(input: BookingStatusInput): BookingStatusResult {
  const {
    status,
    instantBook,
    startAt,
    endAt,
    isHost,
    now = new Date()
  } = input;

  const start = startAt instanceof Date ? startAt : new Date(startAt);
  const end = endAt instanceof Date ? endAt : new Date(endAt);

  // Handle cancellation (same for both driver and host)
  if (status === 'canceled' || status === 'refunded') {
    return { label: 'Cancelled', variant: 'destructive' };
  }

  // Handle completion
  if (status === 'completed') {
    return { label: 'Completed', variant: 'secondary' };
  }

  // Check if stay has ended (treat as completed)
  if (now > end && status !== 'pending' && status !== 'held') {
    return { label: 'Completed', variant: 'secondary' };
  }

  // Handle declined/rejected (for non-instant book spots)
  if (status === 'declined' || status === 'rejected') {
    return { label: 'Declined', variant: 'destructive' };
  }

  // Check timing states
  const hasStarted = now >= start;
  const isOngoing = now >= start && now <= end;

  // Active state: during the stay period
  if (isOngoing && (status === 'active' || status === 'paid' || status === 'held')) {
    return { label: 'Active', variant: 'default' };
  }

  // For instant book spots
  if (instantBook) {
    // Before stay starts: "Booked" (includes held during payment processing)
    if (!hasStarted && (status === 'active' || status === 'paid' || status === 'held')) {
      return { label: 'Booked', variant: 'default' };
    }
    // Pending for instant-book is unusual but treat as Booked
    if (!hasStarted && status === 'pending') {
      return { label: 'Booked', variant: 'default' };
    }
  } else {
    // For spots requiring host confirmation

    // Pending status = waiting for host confirmation = "Requested"
    if (status === 'pending') {
      return { label: 'Requested', variant: 'outline' };
    }

    // Held status during payment processing after host approval = "Booked"
    if (!hasStarted && status === 'held') {
      return { label: 'Booked', variant: 'default' };
    }

    // After host confirms (active/paid) but before stay starts: "Booked"
    if (!hasStarted && (status === 'active' || status === 'paid')) {
      return { label: 'Booked', variant: 'default' };
    }
  }

  // Default fallback
  return { label: 'Booked', variant: 'default' };
}

/**
 * Get status color classes for badges
 */
export function getBookingStatusColor(label: BookingStatusLabel): string {
  switch (label) {
    case 'Cancelled':
    case 'Declined':
      return 'bg-destructive/10 text-destructive border-destructive/20';
    case 'Completed':
      return 'bg-green-100 dark:bg-green-900/20 text-green-700 dark:text-green-500 border-green-200 dark:border-green-800';
    case 'Active':
      return 'bg-primary/10 text-primary border-primary/20';
    case 'Booked':
      return 'bg-blue-100 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-800';
    case 'Requested':
      return 'bg-amber-100 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-800';
    default:
      return 'bg-muted text-muted-foreground border-border';
  }
}

/**
 * Get status color with special handling for overstay
 */
export function getBookingStatusColorWithOverstay(
  label: BookingStatusLabel,
  hasOverstay: boolean
): string {
  if (label === 'Completed' && hasOverstay) {
    return 'bg-yellow-100 dark:bg-yellow-900/20 text-yellow-700 dark:text-yellow-500 border-yellow-200 dark:border-yellow-800';
  }
  return getBookingStatusColor(label);
}

/**
 * Get status label text with overstay suffix if applicable
 */
export function getBookingStatusLabelWithOverstay(
  label: BookingStatusLabel,
  hasOverstay: boolean
): string {
  if (label === 'Completed' && hasOverstay) {
    return 'Completed - Late';
  }
  return label;
}
