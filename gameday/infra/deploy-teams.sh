#!/bin/bash
#
# deploy-teams.sh - Deploy o11y Game Day application to Kubernetes
#
# Usage: ./deploy-teams.sh --splunk-token xxx --splunk-realm jp0 [--enable-flags]

set -e

# Default values
SPLUNK_REALM="jp0"
CLUSTER_NAME="gameday-otel-demo"
REGION="ap-northeast-1"
MANIFEST_VERSION="1.5.5"
ENV_ID=""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

print_usage() {
    cat << EOF
Usage: $0 [OPTIONS]

Required Options:
  --splunk-token TOKEN   Splunk Observability Cloud access token

Optional:
  --splunk-realm REALM   Splunk realm (default: jp0)
  --rum-token TOKEN      Splunk RUM token (required for Browser RUM and Session Replay)
  --cluster-name NAME    Kubernetes cluster name (default: gameday-otel-demo)
                         OTel environment tag is {cluster-name}-{6char-hash}
  --env-id ID            OTel environment tag suffix (default: auto-generated 6-char hex)
  --region REGION        AWS region (default: ap-northeast-1)
  --manifest-version VER Manifest version (default: 1.5.5)
  --enable-flags         Enable all Game Day feature flags after deployment
  --skip-collector       Skip Splunk OTel Collector installation
  --dry-run              Show what would be deployed without deploying
  --help                 Show this help message

Example:
  $0 --splunk-token abc123 --cluster-name gameday-kind --enable-flags

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

log_step() {
    echo -e "${CYAN}[STEP]${NC} $1"
}

# Enable Game Day feature flags by patching flagd ConfigMap
enable_gameday_flags() {
    local NAMESPACE="$1"
    log_step "Enabling Game Day feature flags..."

    # Get current flagd config
    local FLAGD_JSON
    FLAGD_JSON=$(kubectl get cm flagd-config -n "$NAMESPACE" -o jsonpath='{.data.demo\.flagd\.json}' 2>/dev/null)
    if [[ -z "$FLAGD_JSON" ]]; then
        log_error "flagd-config ConfigMap not found in namespace $NAMESPACE"
        return 1
    fi

    # Patch flags using python3
    local PATCHED_JSON
    PATCHED_JSON=$(echo "$FLAGD_JSON" | python3 -c '
import json, sys
data = json.load(sys.stdin)
flags = data.get("flags", {})
# Map of flag name -> target defaultVariant
# Required flags for Game Day: cartFailure, imageSlowLoad, adHighCpu, paymentFailure(50%)
targets = {
    "cartFailure": "on",
    "imageSlowLoad": "5sec",
    "adHighCpu": "on",
    "paymentFailure": "50%",
}
changed = []
for flag_name, target_variant in targets.items():
    if flag_name in flags:
        old = flags[flag_name].get("defaultVariant", "")
        if old != target_variant:
            flags[flag_name]["defaultVariant"] = target_variant
            changed.append(f"{flag_name}: {old} -> {target_variant}")
    else:
        print(f"WARNING: Flag {flag_name} not found", file=sys.stderr)
for c in changed:
    print(f"  {c}", file=sys.stderr)
json.dump(data, sys.stdout, indent=2)
')

    if [[ -z "$PATCHED_JSON" ]]; then
        log_error "Failed to patch flagd configuration"
        return 1
    fi

    # Apply patched ConfigMap
    kubectl create configmap flagd-config \
        --namespace "$NAMESPACE" \
        --from-literal="demo.flagd.json=$PATCHED_JSON" \
        --dry-run=client -o yaml | kubectl apply -f -

    # Restart flagd to pick up changes
    kubectl rollout restart deployment/flagd -n "$NAMESPACE"
    log_info "Waiting for flagd to restart..."
    kubectl rollout status deployment/flagd -n "$NAMESPACE" --timeout=120s 2>/dev/null || true

    log_info "Feature flags enabled successfully"
}

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --splunk-token)
            SPLUNK_TOKEN="$2"
            shift 2
            ;;
        --splunk-realm)
            SPLUNK_REALM="$2"
            shift 2
            ;;
        --rum-token)
            RUM_TOKEN="$2"
            shift 2
            ;;
        --cluster-name)
            CLUSTER_NAME="$2"
            shift 2
            ;;
        --env-id)
            ENV_ID="$2"
            shift 2
            ;;
        --region)
            REGION="$2"
            shift 2
            ;;
        --manifest-version)
            MANIFEST_VERSION="$2"
            shift 2
            ;;
        --enable-flags)
            ENABLE_FLAGS=true
            shift
            ;;
        --skip-collector)
            SKIP_COLLECTOR=true
            shift
            ;;
        --dry-run)
            DRY_RUN=true
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

# Validate required parameters
if [[ -z "$SPLUNK_TOKEN" ]]; then
    log_error "Splunk access token is required (--splunk-token)"
    exit 1
fi

if [[ -z "$RUM_TOKEN" ]]; then
    log_warn "RUM token not set (--rum-token). Browser RUM and Session Replay will not function."
fi

# Check prerequisites
log_step "Checking prerequisites..."

if ! command -v kubectl &> /dev/null; then
    log_error "kubectl is not installed"
    exit 1
fi

if ! command -v helm &> /dev/null; then
    log_error "helm is not installed"
    exit 1
fi

# Verify cluster connection
log_step "Verifying cluster connection..."
if ! kubectl cluster-info &> /dev/null; then
    log_error "Cannot connect to Kubernetes cluster"
    log_info "For EKS: aws eks update-kubeconfig --name ${CLUSTER_NAME} --region ${REGION}"
    exit 1
fi

# Check manifest file
MANIFEST_FILE="${REPO_ROOT}/kubernetes/splunk-astronomy-shop-${MANIFEST_VERSION}.yaml"
if [[ ! -f "$MANIFEST_FILE" ]]; then
    log_error "Manifest file not found: $MANIFEST_FILE"
    log_info "Available manifests:"
    ls -1 "${REPO_ROOT}/kubernetes/splunk-astronomy-shop-"*.yaml 2>/dev/null || echo "  None found"
    exit 1
fi

NAMESPACE="otel-demo"

log_info "=== o11y Game Day Deployment ==="
log_info "Cluster: ${CLUSTER_NAME}"
log_info "Region: ${REGION}"
log_info "Namespace: ${NAMESPACE}"
log_info "Splunk realm: ${SPLUNK_REALM}"
log_info "Manifest: splunk-astronomy-shop-${MANIFEST_VERSION}.yaml"
log_info "Enable flags: ${ENABLE_FLAGS:-false}"
echo ""

if [[ "$DRY_RUN" == "true" ]]; then
    log_warn "DRY RUN MODE - No changes will be made"
    echo ""
fi

# Ensure local-path StorageClass exists (for kind clusters)
log_step "Checking StorageClass..."
if ! kubectl get storageclass local-path &> /dev/null; then
    if kubectl get storageclass standard &> /dev/null; then
        log_info "Creating local-path StorageClass alias..."
        if [[ "$DRY_RUN" != "true" ]]; then
            PROVISIONER=$(kubectl get storageclass standard -o jsonpath='{.provisioner}')
            kubectl create -f - <<EOF
apiVersion: storage.k8s.io/v1
kind: StorageClass
metadata:
  name: local-path
provisioner: ${PROVISIONER}
reclaimPolicy: Delete
volumeBindingMode: WaitForFirstConsumer
EOF
        fi
    fi
fi

# Install Splunk OTel Collector (shared)
if [[ "$SKIP_COLLECTOR" != "true" ]]; then
    log_step "Installing Splunk OTel Collector..."

    if [[ "$DRY_RUN" != "true" ]]; then
        helm repo add splunk-otel-collector-chart https://signalfx.github.io/splunk-otel-collector-chart 2>/dev/null || true
        helm repo update splunk-otel-collector-chart

        helm upgrade --install splunk-otel-collector splunk-otel-collector-chart/splunk-otel-collector \
            --set="splunkObservability.accessToken=${SPLUNK_TOKEN}" \
            --set="splunkObservability.realm=${SPLUNK_REALM}" \
            --set="clusterName=${CLUSTER_NAME}" \
            --set="environment=${OTEL_ENV}" \
            --namespace splunk-monitoring \
            --create-namespace \
            --wait

        log_info "Splunk OTel Collector installed successfully"
    else
        log_info "[DRY-RUN] Would install Splunk OTel Collector in splunk-monitoring namespace"
    fi
fi

# Generate unique OTel environment tag
if [[ -z "$ENV_ID" ]]; then
    ENV_ID=$(openssl rand -hex 3)
fi
OTEL_ENV="${CLUSTER_NAME}-${ENV_ID}"
log_info "OTel environment tag: ${OTEL_ENV}"

# Deploy application to single namespace
log_step "Deploying application to namespace ${NAMESPACE}..."

if [[ "$DRY_RUN" == "true" ]]; then
    log_info "[DRY-RUN] Would create namespace ${NAMESPACE} and deploy demo"
    log_info "[DRY-RUN] Environment: ${OTEL_ENV}"
    if [[ "$ENABLE_FLAGS" == "true" ]]; then
        log_info "[DRY-RUN] Would enable Game Day feature flags"
    fi
    log_info "[DRY-RUN] Deployment complete"
    exit 0
fi

# Create namespace with labels
kubectl create namespace "$NAMESPACE" --dry-run=client -o yaml | \
    kubectl label --local -f - \
        project=o11y-gameday \
        splunkit_data_classification=public \
        splunkit_environment_type=non-prd \
        --overwrite -o yaml | \
    kubectl apply -f -

# Create workshop-secret
log_info "Creating workshop-secret..."
kubectl create secret generic workshop-secret \
    --namespace "$NAMESPACE" \
    --from-literal=instance="shop-demo" \
    --from-literal=app="store" \
    --from-literal=env="${OTEL_ENV}" \
    --from-literal=deployment="deployment.environment=${OTEL_ENV}" \
    --from-literal=realm="${SPLUNK_REALM}" \
    --from-literal=access_token="${SPLUNK_TOKEN}" \
    --from-literal=api_token="${SPLUNK_TOKEN}" \
    --from-literal=rum_token="${RUM_TOKEN:-}" \
    --from-literal=hec_token="" \
    --from-literal=hec_url="" \
    --from-literal=url="" \
    --from-literal=appd_token="" \
    --from-literal=flagd_auth="false" \
    --from-literal=flagd_user="" \
    --from-literal=flagd_pw="" \
    --dry-run=client -o yaml | kubectl apply -f -

# Deploy OpenTelemetry Demo to the namespace
# Note: Some resources (e.g., shop-dc-shim) have namespace: default hardcoded
# and will fail with namespace mismatch errors. These are safely ignored.
kubectl apply --namespace "$NAMESPACE" -f "$MANIFEST_FILE" 2>&1 | \
    grep -v "does not match the namespace" || true

# Patch deployments to set deployment.environment
log_info "Patching deployments with environment..."
for DEPLOYMENT in $(kubectl get deployments -n "$NAMESPACE" -o name 2>/dev/null); do
    kubectl set env "$DEPLOYMENT" -n "$NAMESPACE" \
        OTEL_RESOURCE_ATTRIBUTES="service.namespace=opentelemetry-demo,deployment.environment=${OTEL_ENV}" \
        2>/dev/null || true
done

# Fix for EC2 environment: Increase flagd-ui memory limit
# Erlang VM detects host memory (32GB on m5.2xlarge) and allocates accordingly,
# causing OOMKilled with default 250Mi limit
log_info "Patching flagd-ui memory limit for EC2 environment..."
kubectl patch deploy flagd-ui -n "$NAMESPACE" --type=json \
    -p='[{"op": "replace", "path": "/spec/template/spec/containers/0/resources/limits/memory", "value": "2560Mi"}]' \
    2>/dev/null || true

# Expose frontend-proxy as NodePort for external access
log_info "Patching frontend-proxy to NodePort (30080)..."
kubectl patch svc frontend-proxy -n "$NAMESPACE" \
    -p '{"spec": {"type": "NodePort", "ports": [{"port": 8080, "targetPort": 8080, "nodePort": 30080}]}}' \
    2>/dev/null || true

log_info "Application deployed successfully"

# Enable feature flags if requested
if [[ "$ENABLE_FLAGS" == "true" ]]; then
    enable_gameday_flags "$NAMESPACE"
fi

# Show deployment status
echo ""
log_step "Deployment status"

SVC_TYPE=$(kubectl get svc frontend-proxy -n "$NAMESPACE" -o jsonpath='{.spec.type}' 2>/dev/null || echo "")
if [[ "$SVC_TYPE" == "NodePort" ]]; then
    NODE_PORT=$(kubectl get svc frontend-proxy -n "$NAMESPACE" -o jsonpath='{.spec.ports[0].nodePort}' 2>/dev/null || echo "")
    log_info "Frontend: NodePort ${NODE_PORT}"
fi

echo ""
log_info "=== Deployment Summary ==="
log_info "Namespace: ${NAMESPACE}"
log_info "Environment: ${OTEL_ENV}"
log_info ""
log_info "To access the frontend:"
log_info "  http://<EC2_IP>:8080"
log_info ""
log_info "To view in Splunk APM, filter by environment:"
log_info "  deployment.environment = ${OTEL_ENV}"

log_info "Deployment completed successfully!"
