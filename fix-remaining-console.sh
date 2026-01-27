#!/bin/bash
# Script to help identify and fix remaining console statements
# This is a reference - actual fixes are done via search_replace

echo "Remaining console.log statements to fix:"
grep -r "console\." src/ --include="*.tsx" --include="*.ts" | grep -v "logger.ts" | grep -v "sentry.ts" | wc -l

echo ""
echo "Files with console statements:"
grep -r "console\." src/ --include="*.tsx" --include="*.ts" -l | grep -v "logger.ts" | grep -v "sentry.ts"
