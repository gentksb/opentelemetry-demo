#!/bin/bash
#
# cleanup-teams.sh - Delete o11y Game Day team namespaces from EKS
#
# Usage: ./cleanup-teams.sh --team-count 5

set -e

# Default values
TEAM_COUNT=1
CLUSTER_NAME="gameday-otel-demo"
KEEP_COLLECTOR=false

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

print_usage() {
    cat << EOF
Usage: $0 [OPTIONS]

Options:
  --team-count NUM       Number of team namespaces to delete (default: 1)
  --cluster-name NAME    EKS cluster name (default: gameday-otel-demo)
  --keep-collector       Keep Splunk OTel Collector (default: delete all)
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
        --cluster-name)
            CLUSTER_NAME="$2"
            shift 2
            ;;
        --keep-collector)
            KEEP_COLLECTOR=true
            shift
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

# Check kubectl
if ! command -v kubectl &> /dev/null; then
    log_error "kubectl is not installed"
    exit 1
fi

# Verify cluster connection
if ! kubectl cluster-info &> /dev/null; then
    log_error "Cannot connect to Kubernetes cluster"
    exit 1
fi

log_info "=== o11y Game Day Cleanup ==="
log_info "Cluster: $CLUSTER_NAME"
log_info "Teams to delete: $TEAM_COUNT"
echo ""

# List namespaces to be deleted
NAMESPACES_TO_DELETE=()
for i in $(seq 1 $TEAM_COUNT); do
    TEAM_ID=$(printf "team-%02d" $i)
    NAMESPACE="otel-demo-${TEAM_ID}"

    # Check if namespace exists
    if kubectl get namespace "$NAMESPACE" &>/dev/null; then
        NAMESPACES_TO_DELETE+=("$NAMESPACE")
        echo "  - $NAMESPACE"
    else
        log_warn "Namespace not found: $NAMESPACE"
    fi
done

# Check for otel-demo namespace (created by manifest)
if kubectl get namespace "otel-demo" &>/dev/null; then
    NAMESPACES_TO_DELETE+=("otel-demo")
    echo "  - otel-demo (from manifest)"
fi

if [[ "$KEEP_COLLECTOR" != "true" ]]; then
    if kubectl get namespace "splunk-monitoring" &>/dev/null; then
        echo "  - splunk-monitoring (Splunk OTel Collector)"
    fi
else
    log_info "(Splunk OTel Collector will be kept)"
fi

if [[ ${#NAMESPACES_TO_DELETE[@]} -eq 0 ]]; then
    log_info "No namespaces to delete."
    exit 0
fi

# Confirm deletion
if [[ "$FORCE" != "true" ]]; then
    echo ""
    read -p "Are you sure you want to delete these namespaces? (y/N) " -n 1 -r
    echo ""
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        log_info "Cancelled."
        exit 0
    fi
fi

# Delete namespaces
log_info "Deleting namespaces..."

for NAMESPACE in "${NAMESPACES_TO_DELETE[@]}"; do
    log_info "Deleting $NAMESPACE..."
    kubectl delete namespace "$NAMESPACE" --wait=false &
done

# Delete Splunk OTel Collector unless --keep-collector is specified
if [[ "$KEEP_COLLECTOR" != "true" ]]; then
    log_info "Deleting Splunk OTel Collector..."
    helm uninstall splunk-otel-collector -n splunk-monitoring 2>/dev/null || true
    kubectl delete namespace splunk-monitoring --wait=false 2>/dev/null || true
fi

# Wait for deletions
log_info "Waiting for namespace deletions to complete..."
for NAMESPACE in "${NAMESPACES_TO_DELETE[@]}"; do
    kubectl wait --for=delete namespace/"$NAMESPACE" --timeout=300s 2>/dev/null || {
        log_warn "Timeout waiting for $NAMESPACE deletion"
    }
done

echo ""
log_info "Cleanup completed!"

# Show remaining namespaces
echo ""
log_info "Remaining game day namespaces:"
kubectl get namespaces | grep -E "otel-demo|splunk-monitoring" || echo "  (none)"
