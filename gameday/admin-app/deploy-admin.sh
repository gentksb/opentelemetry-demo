#!/bin/bash
#
# deploy-admin.sh - Deploy o11y Game Day Admin App via ECS Express Mode
#
# Usage: ./deploy-admin.sh [OPTIONS]
#
# This script builds the Docker image, pushes it to ECR, and deploys the
# admin app using CloudFormation (ECS Express Mode + DynamoDB).
#

set -e

# Default values
REGION="ap-northeast-1"
ENVIRONMENT="dev"
STACK_NAME=""
ECR_REPO_NAME="gameday-admin"
IMAGE_TAG="latest"
CREATE_DYNAMODB="false"
CLUSTER_NAME=""
SPLUNK_REALM="jp0"
ADMIN_PASSWORD=""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

print_usage() {
    cat << EOF
Usage: $0 [OPTIONS]

Deploy the o11y Game Day Admin App to AWS (ECS Express Mode).

Options:
  --region REGION        AWS region (default: ap-northeast-1)
  --environment ENV      Environment name: dev or prod (default: dev)
  --stack-name NAME      CloudFormation stack name (default: gameday-admin-{environment})
  --image-tag TAG        Docker image tag (default: latest)
  --create-dynamodb      Create DynamoDB tables (skip if already exist in another stack)
  --skip-build           Skip Docker build and ECR push (use existing image)
  --dry-run              Show what would be deployed without deploying
  --delete               Delete the stack and ECR repository
  --help                 Show this help message

Examples:
  # Full deploy (build + push + CloudFormation)
  $0

  # Deploy to prod
  $0 --environment prod

  # Redeploy with new image (skip build if image already pushed)
  $0 --skip-build

  # Delete everything
  $0 --delete

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
        --region)
            REGION="$2"
            shift 2
            ;;
        --environment)
            ENVIRONMENT="$2"
            shift 2
            ;;
        --stack-name)
            STACK_NAME="$2"
            shift 2
            ;;
        --image-tag)
            IMAGE_TAG="$2"
            shift 2
            ;;
        --create-dynamodb)
            CREATE_DYNAMODB="true"
            shift
            ;;
        --cluster-name)
            CLUSTER_NAME="$2"
            shift 2
            ;;
        --splunk-realm)
            SPLUNK_REALM="$2"
            shift 2
            ;;
        --admin-password)
            ADMIN_PASSWORD="$2"
            shift 2
            ;;
        --skip-build)
            SKIP_BUILD=true
            shift
            ;;
        --dry-run)
            DRY_RUN=true
            shift
            ;;
        --delete)
            DELETE_MODE=true
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

# Set defaults that depend on other params
if [[ -z "$STACK_NAME" ]]; then
    STACK_NAME="gameday-admin-${ENVIRONMENT}"
fi

# Get AWS account ID
AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text 2>/dev/null) || {
    log_error "Failed to get AWS account ID. Check your AWS credentials."
    log_info "Run: aws configure"
    exit 1
}
ECR_URI="${AWS_ACCOUNT_ID}.dkr.ecr.${REGION}.amazonaws.com"
IMAGE_URI="${ECR_URI}/${ECR_REPO_NAME}:${IMAGE_TAG}"

# ============================================================
# Delete mode
# ============================================================
if [[ "$DELETE_MODE" == "true" ]]; then
    log_step "Deleting stack: ${STACK_NAME}"

    if [[ "$DRY_RUN" == "true" ]]; then
        log_info "[DRY-RUN] Would delete CloudFormation stack: ${STACK_NAME}"
        log_info "[DRY-RUN] Would delete ECR repository: ${ECR_REPO_NAME}"
        exit 0
    fi

    # Delete CloudFormation stack
    if aws cloudformation describe-stacks --stack-name "$STACK_NAME" --region "$REGION" &>/dev/null; then
        log_info "Deleting CloudFormation stack..."
        aws cloudformation delete-stack --stack-name "$STACK_NAME" --region "$REGION"
        log_info "Waiting for stack deletion..."
        aws cloudformation wait stack-delete-complete --stack-name "$STACK_NAME" --region "$REGION"
        log_info "Stack deleted successfully"
    else
        log_warn "Stack ${STACK_NAME} does not exist"
    fi

    # Delete ECR repository
    if aws ecr describe-repositories --repository-names "$ECR_REPO_NAME" --region "$REGION" &>/dev/null; then
        log_info "Deleting ECR repository..."
        aws ecr delete-repository --repository-name "$ECR_REPO_NAME" --region "$REGION" --force
        log_info "ECR repository deleted"
    else
        log_warn "ECR repository ${ECR_REPO_NAME} does not exist"
    fi

    log_info "Cleanup completed!"
    exit 0
fi

# ============================================================
# Prerequisites check
# ============================================================
log_step "Checking prerequisites..."

if ! command -v aws &>/dev/null; then
    log_error "AWS CLI is not installed"
    exit 1
fi

if ! command -v docker &>/dev/null; then
    log_error "Docker is not installed"
    exit 1
fi

# Verify Docker daemon is running
if ! docker info &>/dev/null; then
    log_error "Docker daemon is not running"
    exit 1
fi

echo ""
log_info "=== o11y Game Day Admin App Deployment ==="
log_info "Account:     ${AWS_ACCOUNT_ID}"
log_info "Region:      ${REGION}"
log_info "Environment: ${ENVIRONMENT}"
log_info "Stack:       ${STACK_NAME}"
log_info "Image:       ${IMAGE_URI}"
echo ""

if [[ "$DRY_RUN" == "true" ]]; then
    log_warn "DRY RUN MODE - No changes will be made"
    echo ""
fi

# ============================================================
# Step 1: Create ECR repository (if needed)
# ============================================================
log_step "Step 1: Ensuring ECR repository exists..."

if [[ "$DRY_RUN" != "true" ]]; then
    if ! aws ecr describe-repositories --repository-names "$ECR_REPO_NAME" --region "$REGION" &>/dev/null; then
        log_info "Creating ECR repository: ${ECR_REPO_NAME}"
        aws ecr create-repository \
            --repository-name "$ECR_REPO_NAME" \
            --region "$REGION" \
            --image-scanning-configuration scanOnPush=true \
            --tags Key=splunkit_data_classification,Value=public Key=splunkit_environment_type,Value=non-prd Key=Project,Value=o11y-gameday \
            --output text --query 'repository.repositoryUri'
    else
        log_info "ECR repository already exists"
    fi
else
    log_info "[DRY-RUN] Would create ECR repository: ${ECR_REPO_NAME}"
fi

# ============================================================
# Step 2: Build and push Docker image
# ============================================================
if [[ "$SKIP_BUILD" != "true" ]]; then
    log_step "Step 2: Building and pushing Docker image..."

    if [[ "$DRY_RUN" != "true" ]]; then
        # ECR login
        log_info "Logging in to ECR..."
        aws ecr get-login-password --region "$REGION" | docker login --username AWS --password-stdin "$ECR_URI"

        # Build
        log_info "Building Docker image..."
        docker build -t "${ECR_REPO_NAME}:${IMAGE_TAG}" "$SCRIPT_DIR"

        # Tag
        docker tag "${ECR_REPO_NAME}:${IMAGE_TAG}" "$IMAGE_URI"

        # Push
        log_info "Pushing image to ECR..."
        docker push "$IMAGE_URI"
        log_info "Image pushed: ${IMAGE_URI}"
    else
        log_info "[DRY-RUN] Would build and push: ${IMAGE_URI}"
    fi
else
    log_step "Step 2: Skipping build (--skip-build)"
    log_info "Using existing image: ${IMAGE_URI}"
fi

# ============================================================
# Step 3: Deploy CloudFormation stack
# ============================================================
log_step "Step 3: Deploying CloudFormation stack..."

if [[ "$DRY_RUN" != "true" ]]; then
    aws cloudformation deploy \
        --template-file "${SCRIPT_DIR}/template.yaml" \
        --stack-name "$STACK_NAME" \
        --region "$REGION" \
        --parameter-overrides \
            Environment="$ENVIRONMENT" \
            ContainerImage="$IMAGE_URI" \
            CreateDynamoDB="$CREATE_DYNAMODB" \
            ClusterName="$CLUSTER_NAME" \
            SplunkRealm="$SPLUNK_REALM" \
            AdminPassword="$ADMIN_PASSWORD" \
            ImageVersion="$(date +%s)" \
        --capabilities CAPABILITY_NAMED_IAM \
        --tags \
            splunkit_data_classification=public \
            splunkit_environment_type=non-prd \
            Project=o11y-gameday

    log_info "CloudFormation stack deployed successfully"
else
    log_info "[DRY-RUN] Would deploy stack: ${STACK_NAME}"
    log_info "[DRY-RUN] Template: ${SCRIPT_DIR}/template.yaml"
    log_info "[DRY-RUN] Parameters: Environment=${ENVIRONMENT} ContainerImage=${IMAGE_URI} CreateDynamoDB=${CREATE_DYNAMODB}"
fi

# ============================================================
# Step 4: Show results
# ============================================================
log_step "Step 4: Deployment results"

if [[ "$DRY_RUN" != "true" ]]; then
    echo ""

    # Get outputs
    ENDPOINT=$(aws cloudformation describe-stacks \
        --stack-name "$STACK_NAME" \
        --region "$REGION" \
        --query "Stacks[0].Outputs[?OutputKey=='ServiceEndpoint'].OutputValue" \
        --output text 2>/dev/null || echo "pending")

    log_info "=== Deployment Complete ==="
    echo ""
    log_info "Admin App URL:  ${ENDPOINT}"
    log_info "Team UI:        ${ENDPOINT}"
    log_info "Admin UI:       ${ENDPOINT}/admin"
    log_info "Health Check:   ${ENDPOINT}/health"
    echo ""
    log_info "To delete all resources:"
    log_info "  $0 --delete --environment ${ENVIRONMENT}"
fi
