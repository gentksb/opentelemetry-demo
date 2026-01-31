#!/bin/bash
#
# cleanup-teams.sh - Delete o11y Game Day EC2 stacks
#
# Usage: ./cleanup-teams.sh --team-count 5

set -e

# Default values
TEAM_COUNT=1
REGION="ap-northeast-1"
STACK_PREFIX="gameday"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

print_usage() {
    cat << EOF
Usage: $0 [OPTIONS]

Options:
  --team-count NUM       Number of team stacks to delete (default: 1)
  --region REGION        AWS region (default: ap-northeast-1)
  --stack-prefix PREFIX  CloudFormation stack prefix (default: gameday)
  --force                Skip confirmation prompt
  --help                 Show this help message

Example:
  $0 --team-count 5 --force

EOF
}

log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --team-count)
            TEAM_COUNT="$2"
            shift 2
            ;;
        --region)
            REGION="$2"
            shift 2
            ;;
        --stack-prefix)
            STACK_PREFIX="$2"
            shift 2
            ;;
        --force)
            FORCE=true
            shift
            ;;
        --help)
            print_usage
            exit 0
            ;;
        *)
            log_error "Unknown option: $1"
            print_usage
            exit 1
            ;;
    esac
done

log_info "=== o11y Game Day Cleanup ==="
log_info "Teams to delete: $TEAM_COUNT"
log_info "Region: $REGION"
log_info "Stack prefix: $STACK_PREFIX"
echo ""

# List stacks to be deleted
STACKS_TO_DELETE=()
for i in $(seq 1 $TEAM_COUNT); do
    TEAM_ID=$(printf "team-%02d" $i)
    STACK_NAME="${STACK_PREFIX}-${TEAM_ID}"

    # Check if stack exists
    if aws cloudformation describe-stacks --stack-name "$STACK_NAME" --region "$REGION" &>/dev/null; then
        STACKS_TO_DELETE+=("$STACK_NAME")
        echo "  - $STACK_NAME"
    else
        log_warn "Stack not found: $STACK_NAME"
    fi
done

if [[ ${#STACKS_TO_DELETE[@]} -eq 0 ]]; then
    log_info "No stacks to delete."
    exit 0
fi

# Confirm deletion
if [[ "$FORCE" != "true" ]]; then
    echo ""
    read -p "Are you sure you want to delete these ${#STACKS_TO_DELETE[@]} stacks? (y/N) " -n 1 -r
    echo ""
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        log_info "Cancelled."
        exit 0
    fi
fi

# Delete stacks
log_info "Deleting stacks..."
declare -A DELETE_PIDS

for STACK_NAME in "${STACKS_TO_DELETE[@]}"; do
    log_info "Deleting $STACK_NAME..."
    aws cloudformation delete-stack \
        --stack-name "$STACK_NAME" \
        --region "$REGION" &
    DELETE_PIDS[$STACK_NAME]=$!
    sleep 1
done

# Wait for deletions
log_info "Waiting for stack deletions to complete..."
FAILED_DELETIONS=()

for STACK_NAME in "${STACKS_TO_DELETE[@]}"; do
    PID=${DELETE_PIDS[$STACK_NAME]}
    wait $PID

    # Wait for stack to be fully deleted
    log_info "Waiting for $STACK_NAME to be deleted..."
    aws cloudformation wait stack-delete-complete \
        --stack-name "$STACK_NAME" \
        --region "$REGION" 2>/dev/null || {
            log_error "Failed to delete $STACK_NAME"
            FAILED_DELETIONS+=("$STACK_NAME")
        }
done

echo ""
if [[ ${#FAILED_DELETIONS[@]} -gt 0 ]]; then
    log_error "Failed deletions: ${FAILED_DELETIONS[*]}"
    exit 1
fi

log_info "All stacks deleted successfully!"
