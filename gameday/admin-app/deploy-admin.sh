#!/bin/bash
#
# deploy-admin.sh - Deploy o11y Game Day Admin App via Lambda (Lambda Web Adapter)
#
# Usage: ./deploy-admin.sh [OPTIONS]
#
# This script builds the Docker image, pushes it to ECR, and deploys the
# admin app using CloudFormation (Lambda Function URL + DynamoDB).
#

set -e

# Default values
REGION="ap-northeast-1"
STACK_SUFFIX=""
STACK_NAME=""
ECR_REPO_NAME="gameday-admin"
IMAGE_TAG="latest"
CREATE_DYNAMODB="false"
CLUSTER_NAME=""
SPLUNK_REALM="jp0"
SPLUNK_ACCESS_TOKEN=""
SPLUNK_RUM_TOKEN=""
ADMIN_PASSWORD=""
USER_TAGS=()

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

Deploy the o11y Game Day Admin App to AWS (Lambda Function URL).

Options:
  --region REGION        AWS region (default: ap-northeast-1)
  --stack-suffix SUFFIX  Optional suffix for stack/resource names (default: none)
                         Stack name becomes gameday-admin-<suffix>
  --stack-name NAME      CloudFormation stack name (overrides --stack-suffix)
  --image-tag TAG        Docker image tag (default: latest)
  --create-dynamodb      Create DynamoDB tables (skip if already exist in another stack)
  --splunk-access-token  Splunk access token for APM/Metrics ingest
  --rum-token            Splunk RUM token for browser RUM (baked into frontend at build time)
  --tags K=V [K=V]       Stack-level tags for SCP compliance (same format as aws cloudformation deploy --tags)
  --skip-build           Skip Docker build and ECR push (use existing image)
  --dry-run              Show what would be deployed without deploying
  --delete               Delete the stack and ECR repository
  --help                 Show this help message

Examples:
  # Full deploy (build + push + CloudFormation)
  $0 --create-dynamodb --admin-password secret123

  # With stack-level tags
  $0 --create-dynamodb --admin-password secret123 --tags splunkit_data_classification=public splunkit_environment_type=non-prd

  # Deploy a second instance with suffix
  $0 --stack-suffix event2 --create-dynamodb

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
        --stack-suffix)
            STACK_SUFFIX="$2"
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
        --splunk-access-token)
            SPLUNK_ACCESS_TOKEN="$2"
            shift 2
            ;;
        --rum-token)
            SPLUNK_RUM_TOKEN="$2"
            shift 2
            ;;
        --admin-password)
            ADMIN_PASSWORD="$2"
            shift 2
            ;;
        --tags)
            shift
            while [[ $# -gt 0 && ! "$1" =~ ^-- ]]; do
                USER_TAGS+=("$1")
                shift
            done
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

# Compute name suffix (includes leading dash when non-empty)
if [[ -n "$STACK_SUFFIX" ]]; then
    NAME_SUFFIX="-${STACK_SUFFIX}"
else
    NAME_SUFFIX=""
fi

# Set defaults that depend on other params
if [[ -z "$STACK_NAME" ]]; then
    STACK_NAME="gameday-admin${NAME_SUFFIX}"
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

    # DynamoDBテーブルの残存チェック（DeletionPolicy: Retain により削除されない）
    DYNAMO_TABLES=("gameday-teams${NAME_SUFFIX}" "gameday-answers${NAME_SUFFIX}" "gameday-questions${NAME_SUFFIX}")
    REMAINING_TABLES=()
    for TABLE in "${DYNAMO_TABLES[@]}"; do
        if aws dynamodb describe-table --table-name "$TABLE" --region "$REGION" &>/dev/null 2>&1; then
            REMAINING_TABLES+=("$TABLE")
        fi
    done

    if [[ ${#REMAINING_TABLES[@]} -gt 0 ]]; then
        echo ""
        log_warn "DynamoDBテーブルは DeletionPolicy: Retain により残っています:"
        for TABLE in "${REMAINING_TABLES[@]}"; do
            log_info "  - ${TABLE}"
        done
        echo ""
        read -p "$(echo -e "${YELLOW}DynamoDBテーブルも削除しますか？ [y/N]: ${NC}")" CONFIRM
        if [[ "$CONFIRM" =~ ^[yY]$ ]]; then
            for TABLE in "${REMAINING_TABLES[@]}"; do
                log_info "Deleting DynamoDB table: ${TABLE}"
                aws dynamodb delete-table --table-name "$TABLE" --region "$REGION" --output text --query 'TableDescription.TableStatus' 2>/dev/null || true
            done
            log_info "DynamoDB tables deleted"
        else
            log_info "DynamoDBテーブルはそのまま残ります。手動で削除するには:"
            for TABLE in "${REMAINING_TABLES[@]}"; do
                log_info "  aws dynamodb delete-table --table-name ${TABLE} --region ${REGION}"
            done
        fi
    fi

    echo ""
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
log_info "Suffix:      ${STACK_SUFFIX:-(none)}"
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
        ECR_TAGS="Key=Project,Value=o11y-gameday"
        for PAIR in "${USER_TAGS[@]}"; do
            KEY="${PAIR%%=*}"
            VALUE="${PAIR#*=}"
            ECR_TAGS="${ECR_TAGS} Key=${KEY},Value=${VALUE}"
        done
        aws ecr create-repository \
            --repository-name "$ECR_REPO_NAME" \
            --region "$REGION" \
            --image-scanning-configuration scanOnPush=true \
            --tags $ECR_TAGS \
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
        APP_VERSION=$(git -C "$SCRIPT_DIR" rev-parse --short HEAD 2>/dev/null || echo "dev")
        docker build \
            --platform linux/amd64 \
            --build-arg SPLUNK_RUM_TOKEN="$SPLUNK_RUM_TOKEN" \
            --build-arg SPLUNK_REALM="$SPLUNK_REALM" \
            --build-arg APP_VERSION="$APP_VERSION" \
            --build-arg DEPLOYMENT_ENV="$CLUSTER_NAME" \
            -t "${ECR_REPO_NAME}:${IMAGE_TAG}" "$SCRIPT_DIR"

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

# 既存スタックが存在する場合、パラメータを安全に引き継ぐ
ADMIN_PASSWORD_PARAM="AdminPassword=${ADMIN_PASSWORD}"
SPLUNK_ACCESS_TOKEN_PARAM="SplunkAccessToken=${SPLUNK_ACCESS_TOKEN}"
if aws cloudformation describe-stacks --stack-name "$STACK_NAME" --region "$REGION" &>/dev/null 2>&1; then
    log_info "既存スタックを検出。パラメータの整合性を確認します..."

    # CreateDynamoDB: 前回trueなら明示的に--create-dynamodbが指定されなくても引き継ぐ
    PREV_CREATE_DB=$(aws cloudformation describe-stacks \
        --stack-name "$STACK_NAME" --region "$REGION" \
        --query "Stacks[0].Parameters[?ParameterKey=='CreateDynamoDB'].ParameterValue" \
        --output text 2>/dev/null)
    if [[ "$PREV_CREATE_DB" == "true" && "$CREATE_DYNAMODB" == "false" ]]; then
        log_info "DynamoDBテーブル管理設定を引き継ぎます (CreateDynamoDB=true)"
        CREATE_DYNAMODB="true"
    fi

    # AdminPassword: 未指定の場合は前回値を引き継ぐ（NoEchoパラメータの安全な処理）
    if [[ -z "$ADMIN_PASSWORD" ]]; then
        ADMIN_PASSWORD_PARAM="ParameterKey=AdminPassword,UsePreviousValue=true"
        log_info "AdminPasswordは前回の値を引き継ぎます"
    fi

    # SplunkAccessToken: 未指定の場合は前回値を引き継ぐ（NoEchoパラメータの安全な処理）
    if [[ -z "$SPLUNK_ACCESS_TOKEN" ]]; then
        SPLUNK_ACCESS_TOKEN_PARAM="ParameterKey=SplunkAccessToken,UsePreviousValue=true"
        log_info "SplunkAccessTokenは前回の値を引き継ぎます"
    fi
fi

if [[ "$DRY_RUN" != "true" ]]; then
    APP_VERSION=${APP_VERSION:-$(git -C "$SCRIPT_DIR" rev-parse --short HEAD 2>/dev/null || echo "dev")}

    # Build stack-level tags
    STACK_TAGS=("Project=o11y-gameday")
    for PAIR in "${USER_TAGS[@]}"; do
        STACK_TAGS+=("${PAIR}")
    done

    set +e
    DEPLOY_OUTPUT=$(aws cloudformation deploy \
        --template-file "${SCRIPT_DIR}/template.yaml" \
        --stack-name "$STACK_NAME" \
        --region "$REGION" \
        --parameter-overrides \
            StackSuffix="$NAME_SUFFIX" \
            ContainerImage="$IMAGE_URI" \
            CreateDynamoDB="$CREATE_DYNAMODB" \
            ClusterName="$CLUSTER_NAME" \
            SplunkRealm="$SPLUNK_REALM" \
            "$ADMIN_PASSWORD_PARAM" \
            "$SPLUNK_ACCESS_TOKEN_PARAM" \
            AppVersion="$APP_VERSION" \
        --capabilities CAPABILITY_NAMED_IAM \
        --tags \
            "${STACK_TAGS[@]}" 2>&1)
    DEPLOY_EXIT=$?
    set -e

    if [[ $DEPLOY_EXIT -ne 0 ]]; then
        echo "$DEPLOY_OUTPUT"
        if echo "$DEPLOY_OUTPUT" | grep -qi "already.exists\|AlreadyExists\|EntityAlreadyExists\|ResourceInUse"; then
            echo ""
            log_error "リソース名が競合しています。別のスタックが同名のリソースを使用している可能性があります。"
            log_info "Use --stack-suffix <suffix> to create a uniquely named stack."
            log_info "Example: $0 --stack-suffix event2"
        fi
        exit $DEPLOY_EXIT
    fi

    log_info "CloudFormation stack deployed successfully"
else
    log_info "[DRY-RUN] Would deploy stack: ${STACK_NAME}"
    log_info "[DRY-RUN] Template: ${SCRIPT_DIR}/template.yaml"
    log_info "[DRY-RUN] Parameters: StackSuffix=${NAME_SUFFIX} ContainerImage=${IMAGE_URI} CreateDynamoDB=${CREATE_DYNAMODB}"
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
        --query "Stacks[0].Outputs[?OutputKey=='FunctionUrl'].OutputValue" \
        --output text 2>/dev/null || echo "pending")

    log_info "=== Deployment Complete ==="
    echo ""
    log_info "Admin App URL:  ${ENDPOINT}"
    log_info "Team UI:        ${ENDPOINT}"
    log_info "Admin UI:       ${ENDPOINT}/admin"
    log_info "Health Check:   ${ENDPOINT}/health"
    echo ""
    log_info "To delete all resources:"
    if [[ -n "$STACK_SUFFIX" ]]; then
        log_info "  $0 --delete --stack-suffix ${STACK_SUFFIX}"
    else
        log_info "  $0 --delete"
    fi
fi
