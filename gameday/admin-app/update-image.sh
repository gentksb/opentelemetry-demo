#!/bin/bash
#
# update-image.sh - Rebuild and redeploy the admin app container image
#
# Usage: ./update-image.sh [--stack-name NAME] [--region REGION]
#
# This script builds the Docker image, pushes it to ECR, and forces
# a new ECS deployment to pick up the updated image.
#

set -e

REGION="ap-northeast-1"
STACK_NAME="gameday-admin"
ECR_REPO_NAME="gameday-admin"
IMAGE_TAG="latest"
SPLUNK_ACCESS_TOKEN=""
SPLUNK_RUM_TOKEN=""
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

while [[ $# -gt 0 ]]; do
    case $1 in
        --stack-name)          STACK_NAME="$2"; shift 2 ;;
        --region)              REGION="$2"; shift 2 ;;
        --splunk-access-token) SPLUNK_ACCESS_TOKEN="$2"; shift 2 ;;
        --rum-token)           SPLUNK_RUM_TOKEN="$2"; shift 2 ;;
        --help)
            echo "Usage: $0 [--stack-name NAME] [--region REGION] [--splunk-access-token TOKEN] [--rum-token TOKEN]"
            echo ""
            echo "Options:"
            echo "  --stack-name           CloudFormation stack name (default: gameday-admin)"
            echo "  --region               AWS region (default: ap-northeast-1)"
            echo "  --splunk-access-token  Splunk access token for APM/Metrics ingest"
            echo "  --rum-token            Splunk RUM token (baked into frontend at build time)"
            exit 0
            ;;
        *) echo "Unknown option: $1"; exit 1 ;;
    esac
done

AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
ECR_URI="${AWS_ACCOUNT_ID}.dkr.ecr.${REGION}.amazonaws.com"
IMAGE_URI="${ECR_URI}/${ECR_REPO_NAME}:${IMAGE_TAG}"

echo "=== Admin App Image Update ==="
echo "Stack:  ${STACK_NAME}"
echo "Image:  ${IMAGE_URI}"
echo ""

# Verify stack exists before proceeding
if ! aws cloudformation describe-stacks --stack-name "$STACK_NAME" --region "$REGION" &>/dev/null 2>&1; then
    echo "Error: Stack '${STACK_NAME}' not found. Run deploy-admin.sh first."
    exit 1
fi

# Fetch current CloudFormation parameters (needed for build args and re-deploy)
CURRENT_PARAMS=$(aws cloudformation describe-stacks \
    --stack-name "$STACK_NAME" \
    --region "$REGION" \
    --query 'Stacks[0].Parameters' \
    --output json)

get_param() {
    echo "$CURRENT_PARAMS" | python3 -c "
import sys, json
params = json.load(sys.stdin)
for p in params:
    if p['ParameterKey'] == '$1':
        print(p['ParameterValue'])
        break
"
}

# Step 1: ECR login
echo "[1/4] ECR login..."
aws ecr get-login-password --region "$REGION" | docker login --username AWS --password-stdin "$ECR_URI"

# Step 2: Build
echo "[2/4] Building Docker image..."
APP_VERSION=$(git -C "$SCRIPT_DIR" rev-parse --short HEAD 2>/dev/null || echo "dev")
SPLUNK_REALM_BUILD=$(get_param SplunkRealm)
CLUSTER_NAME_BUILD=$(get_param ClusterName)
docker build \
    --build-arg SPLUNK_RUM_TOKEN="$SPLUNK_RUM_TOKEN" \
    --build-arg SPLUNK_REALM="$SPLUNK_REALM_BUILD" \
    --build-arg APP_VERSION="$APP_VERSION" \
    --build-arg DEPLOYMENT_ENV="$CLUSTER_NAME_BUILD" \
    -t "${ECR_REPO_NAME}:${IMAGE_TAG}" "$SCRIPT_DIR"

# Step 3: Push
echo "[3/4] Pushing to ECR..."
docker tag "${ECR_REPO_NAME}:${IMAGE_TAG}" "$IMAGE_URI"
docker push "$IMAGE_URI"

# Step 4: Force new ECS deployment via CloudFormation update
echo "[4/4] Updating ECS service via CloudFormation..."
SPLUNK_ACCESS_TOKEN_PARAM="ParameterKey=SplunkAccessToken,UsePreviousValue=true"
if [[ -n "$SPLUNK_ACCESS_TOKEN" ]]; then
    SPLUNK_ACCESS_TOKEN_PARAM="SplunkAccessToken=${SPLUNK_ACCESS_TOKEN}"
fi

aws cloudformation deploy \
    --template-file "${SCRIPT_DIR}/template.yaml" \
    --stack-name "$STACK_NAME" \
    --region "$REGION" \
    --parameter-overrides \
        StackSuffix="$(get_param StackSuffix)" \
        ContainerImage="$IMAGE_URI" \
        CreateDynamoDB="$(get_param CreateDynamoDB)" \
        ClusterName="$(get_param ClusterName)" \
        SplunkRealm="$(get_param SplunkRealm)" \
        "ParameterKey=AdminPassword,UsePreviousValue=true" \
        "$SPLUNK_ACCESS_TOKEN_PARAM" \
        AppVersion="$APP_VERSION" \
        ImageVersion="$(date +%s)" \
    --capabilities CAPABILITY_NAMED_IAM \
    --tags \
        Project=o11y-gameday

ENDPOINT=$(aws cloudformation describe-stacks \
    --stack-name "$STACK_NAME" \
    --region "$REGION" \
    --query "Stacks[0].Outputs[?OutputKey=='ServiceEndpoint'].OutputValue" \
    --output text 2>/dev/null || echo "pending")

echo ""
echo "=== Update Complete ==="
echo "Endpoint: ${ENDPOINT}"
echo "Admin:    ${ENDPOINT}/admin"
