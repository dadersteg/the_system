#!/bin/bash

# test_runner.sh
# Executes key pipelines sequentially using clasp run for end-to-end testing.

ENV_NAME=$1
if [ -z "$ENV_NAME" ]; then
  echo "Usage: ./test_runner.sh [private|work]"
  exit 1
fi

echo "==============================================="
echo " STARTING SYSTEM INTEGRITY TEST: $ENV_NAME"
echo "==============================================="

# Configure Clasp
if [ "$ENV_NAME" = "private" ]; then
  cp .clasp-private.json .clasp.json
elif [ "$ENV_NAME" = "work" ]; then
  cp .clasp-work.json .clasp.json
else
  echo "Invalid environment. Use 'private' or 'work'."
  exit 1
fi

run_test() {
  FUNC_NAME=$1
  DESC=$2
  
  echo ""
  echo "-----------------------------------------------"
  echo " Testing: $DESC ($FUNC_NAME)"
  echo "-----------------------------------------------"
  
  # Execute clasp run
  OUTPUT=$(npx clasp run "$FUNC_NAME" 2>&1)
  EXIT_CODE=$?
  
  echo "$OUTPUT"
  
  if [ $EXIT_CODE -ne 0 ]; then
    echo "❌ ERROR: $FUNC_NAME failed. Aborting test sequence."
    exit 1
  fi
  
  # Check if output contains clasp error strings that return exit code 0
  if echo "$OUTPUT" | grep -q "Unable to run script function"; then
     echo "❌ ERROR: API Executable permission error detected. Aborting."
     exit 1
  fi

  if echo "$OUTPUT" | grep -q "Exception:"; then
     echo "❌ ERROR: Script Exception detected. Aborting."
     exit 1
  fi
  
  echo "✅ SUCCESS: $FUNC_NAME completed smoothly."
}

# 1. Task Master Ingestion
run_test "run1DayTaskMaintenance" "Task Master Pipeline (Data Ingestion & Sync)"

# 2. Hourly Review / 1-Day Plan
run_test "runHourlyReview" "1-Day Execution Plan Generation"

# 3. Timeboxing
run_test "executeTimeboxing" "Calendar Timeboxing Engine"

# 4. The Clerk (Categorization)
run_test "runTheClerkNotes" "The Clerk - Notes"
run_test "runTheClerkDriveOngoing" "The Clerk - Drive"
run_test "runTheClerkEmailOngoing" "The Clerk - Email"

# 5. Strategic Reviews (These are heavy, we run them last)
run_test "runWeeklyReview" "7-Day Roadmap Generation"
run_test "runMonthlyReview" "28-Day Strategic Plan Generation"

echo ""
echo "==============================================="
echo " ✅✅ ALL TESTS PASSED FOR $ENV_NAME ✅✅"
echo "==============================================="

# Restore default to private just to be safe
cp .clasp-private.json .clasp.json
exit 0
