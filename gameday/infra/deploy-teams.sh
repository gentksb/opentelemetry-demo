#!/bin/bash
#
# deploy-teams.sh - Deploy o11y Game Day team namespaces to Kubernetes
#
# Usage: ./deploy-teams.sh --team-count 5 --splunk-token xxx --splunk-realm jp0

set -e

# Default values
TEAM_COUNT=1
SPLUNK_REALM="jp0"
CLUSTER_NAME="gameday-otel-demo"
REGION="ap-northeast-1"
MANIFEST_VERSION="1.5.5"

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
  --team-count NUM       Number of teams to deploy (default: 1)
  --splunk-realm REALM   Splunk realm (default: jp0)
  --rum-token TOKEN      Splunk RUM token (optional)
  --cluster-name NAME    Kubernetes cluster name (default: gameday-otel-demo)
  --region REGION        AWS region (default: ap-northeast-1)
  --manifest-version VER Manifest version (default: 1.5.5)
  --skip-collector       Skip Splunk OTel Collector installation
  --dry-run              Show what would be deployed without deploying
  --help                 Show this help message

Example:
  $0 --team-count 5 --splunk-token abc123

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

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --team-count)
            TEAM_COUNT="$2"
            shift 2
            ;;
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
        --region)
            REGION="$2"
            shift 2
            ;;
        --manifest-version)
            MANIFEST_VERSION="$2"
            shift 2
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

log_info "=== o11y Game Day Deployment ==="
log_info "Cluster: ${CLUSTER_NAME}"
log_info "Region: ${REGION}"
log_info "Teams to deploy: ${TEAM_COUNT}"
log_info "Splunk realm: ${SPLUNK_REALM}"
log_info "Manifest: splunk-astronomy-shop-${MANIFEST_VERSION}.yaml"
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
            --set="environment=${CLUSTER_NAME}" \
            --namespace splunk-monitoring \
            --create-namespace \
            --wait

        log_info "Splunk OTel Collector installed successfully"
    else
        log_info "[DRY-RUN] Would install Splunk OTel Collector in splunk-monitoring namespace"
    fi
fi

# Store deployment results
OUTPUT_FILE="${SCRIPT_DIR}/deployment-results.txt"
echo "# o11y Game Day Deployment Results" > "$OUTPUT_FILE"
echo "# Generated: $(date)" >> "$OUTPUT_FILE"
echo "# Cluster: ${CLUSTER_NAME}" >> "$OUTPUT_FILE"
echo "" >> "$OUTPUT_FILE"

# Deploy teams
log_step "Deploying team namespaces..."

for i in $(seq 1 $TEAM_COUNT); do
    TEAM_ID=$(printf "team-%02d" $i)
    NAMESPACE="otel-demo-${TEAM_ID}"
    TEAM_ENV="${CLUSTER_NAME}-${TEAM_ID}"

    log_info "Deploying ${TEAM_ID} to namespace ${NAMESPACE}..."

    if [[ "$DRY_RUN" == "true" ]]; then
        log_info "[DRY-RUN] Would create namespace ${NAMESPACE} and deploy demo"
        continue
    fi

    # Create namespace with team label
    kubectl create namespace "$NAMESPACE" --dry-run=client -o yaml | \
        kubectl label --local -f - \
            team-id="$TEAM_ID" \
            project=o11y-gameday \
            splunkit_data_classification=public \
            splunkit_environment_type=non-prd \
            --overwrite -o yaml | \
        kubectl apply -f -

    # Create workshop-secret for this team
    log_info "Creating workshop-secret for ${TEAM_ID}..."
    kubectl create secret generic workshop-secret \
        --namespace "$NAMESPACE" \
        --from-literal=instance="${TEAM_ID}-shop-demo" \
        --from-literal=app="${TEAM_ID}-store" \
        --from-literal=env="${TEAM_ENV}" \
        --from-literal=deployment="deployment.environment=${TEAM_ENV}" \
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
    kubectl apply --namespace "$NAMESPACE" -f "$MANIFEST_FILE"

    # Patch deployments to add team.id label and deployment.environment
    log_info "Patching deployments with team identifier..."
    for DEPLOYMENT in $(kubectl get deployments -n "$NAMESPACE" -o name 2>/dev/null); do
        DEPLOY_NAME=$(basename "$DEPLOYMENT")

        # Add team-id label
        kubectl patch "$DEPLOYMENT" -n "$NAMESPACE" --type=json \
            -p="[{\"op\": \"add\", \"path\": \"/spec/template/metadata/labels/team-id\", \"value\": \"${TEAM_ID}\"}]" 2>/dev/null || true

        # Add deployment.environment to OTEL_RESOURCE_ATTRIBUTES
        kubectl set env "$DEPLOYMENT" -n "$NAMESPACE" \
            OTEL_RESOURCE_ATTRIBUTES="service.namespace=opentelemetry-demo,deployment.environment=${TEAM_ENV}" \
            2>/dev/null || true
    done

    # Fix for EC2 environment: Increase flagd-ui memory limit
    # Erlang VM detects host memory (32GB on m5.2xlarge) and allocates accordingly,
    # causing OOMKilled with default 250Mi limit
    log_info "Patching flagd-ui memory limit for EC2 environment..."
    kubectl patch deploy flagd-ui -n "$NAMESPACE" --type=json \
        -p='[{"op": "replace", "path": "/spec/template/spec/containers/0/resources/limits/memory", "value": "2560Mi"}]' \
        2>/dev/null || true

    # Fix for kind: Expose frontend-proxy as NodePort for external access
    log_info "Patching frontend-proxy to NodePort..."
    NODE_PORT=$((30080 + i - 1))
    kubectl patch svc frontend-proxy -n "$NAMESPACE" \
        -p "{\"spec\": {\"type\": \"NodePort\", \"ports\": [{\"port\": 8080, \"targetPort\": 8080, \"nodePort\": ${NODE_PORT}}]}}" \
        2>/dev/null || true

    log_info "${TEAM_ID} deployed successfully"
    echo "${TEAM_ID},${NAMESPACE},${TEAM_ENV}" >> "$OUTPUT_FILE"
done

echo ""
log_step "Checking deployment status..."

for i in $(seq 1 $TEAM_COUNT); do
    TEAM_ID=$(printf "team-%02d" $i)
    NAMESPACE="otel-demo-${TEAM_ID}"

    if [[ "$DRY_RUN" == "true" ]]; then
        continue
    fi

    # Get frontend-proxy service info
    SVC_TYPE=$(kubectl get svc frontend-proxy -n "$NAMESPACE" -o jsonpath='{.spec.type}' 2>/dev/null || echo "")

    if [[ "$SVC_TYPE" == "LoadBalancer" ]]; then
        EXTERNAL_IP=$(kubectl get svc frontend-proxy -n "$NAMESPACE" -o jsonpath='{.status.loadBalancer.ingress[0].hostname}' 2>/dev/null || echo "pending")
        log_info "${TEAM_ID}: LoadBalancer - ${EXTERNAL_IP}"
    elif [[ "$SVC_TYPE" == "NodePort" ]]; then
        NODE_PORT=$(kubectl get svc frontend-proxy -n "$NAMESPACE" -o jsonpath='{.spec.ports[0].nodePort}' 2>/dev/null || echo "")
        log_info "${TEAM_ID}: NodePort - ${NODE_PORT}"
    else
        log_info "${TEAM_ID}: ClusterIP - use port-forward"
    fi
done

echo ""
log_info "=== Deployment Summary ==="
log_info "Results saved to: ${OUTPUT_FILE}"

if [[ "$DRY_RUN" != "true" ]]; then
    echo ""
    log_info "Team namespaces deployed:"
    kubectl get namespaces -l project=o11y-gameday --no-headers 2>/dev/null | awk '{print "  - " $1}' || echo "  None"

    echo ""
    log_info "To access a team's frontend:"
    log_info "  kubectl port-forward -n otel-demo-team-01 svc/frontend-proxy 8080:8080"

    echo ""
    log_info "To view in Splunk APM, filter by environment:"
    log_info "  deployment.environment = ${CLUSTER_NAME}-team-01"
fi

log_info "Deployment completed successfully!"
