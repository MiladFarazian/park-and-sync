# Console.log Migration Guide

## Status
We've started migrating from `console.log/error/warn` to the structured logger utility. This document tracks progress and provides guidance.

## Completed Files
- ✅ `src/pages/NotFound.tsx` - Replaced console.error with logger.warn
- ✅ `src/components/guest/GuestChatPane.tsx` - Replaced console.error with logger.error
- ✅ `src/components/booking/GuestBookingForm.tsx` - Replaced console.error with logger.error
- ✅ `src/pages/Messages.tsx` - Replaced console.error with logger.error
- ✅ `src/App.tsx` - Already using logger or conditional logging
- ✅ `src/lib/logger.ts` - Logger implementation (uses console internally but with proper filtering)

## Remaining Files (61 files with ~245 instances)

### High Priority Files (User-facing, frequently used)
1. `src/pages/Home.tsx` - Multiple console.log statements
2. `src/pages/Explore.tsx` - Debug logging
3. `src/pages/Booking.tsx` - Error and debug logging
4. `src/pages/SpotDetail.tsx` - Multiple console statements
5. `src/pages/BookingDetail.tsx` - Error logging
6. `src/pages/Profile.tsx` - Console statements
7. `src/pages/Auth.tsx` - Console statements
8. `src/contexts/AuthContext.tsx` - Debug logging
9. `src/components/map/MapView.tsx` - Debug logging
10. `src/hooks/useNotifications.tsx` - Multiple console statements

### Migration Pattern

**Before:**
```typescript
console.log('Some message', data);
console.error('Error occurred:', error);
console.warn('Warning message');
```

**After:**
```typescript
import { logger } from '@/lib/logger';

// For debug/info logs
logger.debug('Some message', data);
logger.info('Some message', data);

// For errors
logger.error('Error occurred:', error);

// For warnings
logger.warn('Warning message');

// For scoped logging (recommended for components)
const log = logger.scope('ComponentName');
log.debug('Component-specific message');
```

### Quick Migration Script

You can use find/replace in your editor:

1. **Find:** `console.log(`
   **Replace:** `logger.debug(` (or `logger.info(` for important info)

2. **Find:** `console.error(`
   **Replace:** `logger.error(`

3. **Find:** `console.warn(`
   **Replace:** `logger.warn(`

4. **Add import at top of file:**
   ```typescript
   import { logger } from '@/lib/logger';
   ```

### Notes
- The logger automatically filters logs in production (only warn/error shown)
- Use `logger.debug()` for verbose development-only logs
- Use `logger.info()` for important information
- Use `logger.warn()` for warnings
- Use `logger.error()` for errors
- Consider using scoped loggers: `const log = logger.scope('FeatureName')`

## Next Steps
1. Continue replacing console statements file by file
2. Run `npm run lint` to catch any missed instances
3. Test in development to ensure logs still work
4. Verify production builds don't show debug logs
