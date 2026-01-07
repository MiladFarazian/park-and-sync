-- Clear rate limit entries for get-guest-messages to immediately restore access
DELETE FROM rate_limits WHERE key LIKE '%get-guest-messages%';