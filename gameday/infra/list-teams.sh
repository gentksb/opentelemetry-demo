#!/bin/bash
#
# list-teams.sh - List o11y Game Day team deployments
#
# Usage: ./list-teams.sh

set -e

# Default values
REGION="ap-northeast-1"
STACK_PREFIX="gameday"

# Colors for output
GREEN='\033[0;32m'
CYAN='\033[0;36m'
NC='\033[0m'

print_usage() {
    cat << EOF
Usage: $0 [OPTIONS]

Options:
  --region REGION        AWS region (default: ap-northeast-1)
  --stack-prefix PREFIX  CloudFormation stack prefix (default: gameday)
  --format FORMAT        Output format: table, csv, json (default: table)
  --help                 Show this help message

EOF
}

# Parse arguments
FORMAT="table"
while [[ $# -gt 0 ]]; do
    case $1 in
        --region)
            REGION="$2"
            shift 2
            ;;
        --stack-prefix)
            STACK_PREFIX="$2"
            shift 2
            ;;
        --format)
            FORMAT="$2"
            shift 2
            ;;
        --help)
            print_usage
            exit 0
            ;;
        *)
            shift
            ;;
    esac
done

# Get all gameday stacks
STACKS=$(aws cloudformation describe-stacks \
    --region "$REGION" \
    --query "Stacks[?starts_with(StackName, '${STACK_PREFIX}-team-')]" \
    --output json 2>/dev/null || echo "[]")

if [[ "$STACKS" == "[]" ]] || [[ $(echo "$STACKS" | jq 'length') -eq 0 ]]; then
    echo "No game day stacks found."
    exit 0
fi

case "$FORMAT" in
    csv)
        echo "TeamId,StackName,Status,PublicIP,ApplicationURL"
        echo "$STACKS" | jq -r '.[] |
            .StackName as $name |
            .StackStatus as $status |
            (.Outputs // []) |
            (map(select(.OutputKey=="TeamId")) | .[0].OutputValue // "N/A") as $team |
            (map(select(.OutputKey=="PublicIP")) | .[0].OutputValue // "N/A") as $ip |
            (map(select(.OutputKey=="ApplicationURL")) | .[0].OutputValue // "N/A") as $url |
            "\($team),\($name),\($status),\($ip),\($url)"'
        ;;
    json)
        echo "$STACKS" | jq '[.[] | {
            stackName: .StackName,
            status: .StackStatus,
            teamId: (.Outputs // [] | map(select(.OutputKey=="TeamId")) | .[0].OutputValue // null),
            publicIP: (.Outputs // [] | map(select(.OutputKey=="PublicIP")) | .[0].OutputValue // null),
            applicationURL: (.Outputs // [] | map(select(.OutputKey=="ApplicationURL")) | .[0].OutputValue // null)
        }]'
        ;;
    table|*)
        echo -e "${GREEN}=== o11y Game Day Team Deployments ===${NC}"
        echo ""
        printf "%-12s %-20s %-15s %-16s %s\n" "TEAM" "STACK" "STATUS" "PUBLIC IP" "APP URL"
        printf "%-12s %-20s %-15s %-16s %s\n" "----" "-----" "------" "---------" "-------"

        echo "$STACKS" | jq -r '.[] |
            .StackName as $name |
            .StackStatus as $status |
            (.Outputs // []) |
            (map(select(.OutputKey=="TeamId")) | .[0].OutputValue // "N/A") as $team |
            (map(select(.OutputKey=="PublicIP")) | .[0].OutputValue // "N/A") as $ip |
            (map(select(.OutputKey=="ApplicationURL")) | .[0].OutputValue // "N/A") as $url |
            "\($team)\t\($name)\t\($status)\t\($ip)\t\($url)"' | \
        while IFS=$'\t' read -r team name status ip url; do
            printf "%-12s %-20s %-15s %-16s %s\n" "$team" "$name" "$status" "$ip" "$url"
        done

        echo ""
        TOTAL=$(echo "$STACKS" | jq 'length')
        RUNNING=$(echo "$STACKS" | jq '[.[] | select(.StackStatus=="CREATE_COMPLETE" or .StackStatus=="UPDATE_COMPLETE")] | length')
        echo -e "${CYAN}Total: $TOTAL stacks, $RUNNING running${NC}"
        ;;
esac
